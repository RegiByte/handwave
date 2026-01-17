/**
 * Worker Detectors Resource
 *
 * Runs MediaPipe detection on video frames.
 * Worker owns its internal canvas - main thread sends ImageBitmap frames.
 * Writes results to SharedArrayBuffer (zero-copy) or message passing (fallback).
 *
 * Philosophy: Pure detection logic. No loop management.
 * Called by workerUpdateLoop each tick.
 */

import type {
  FaceLandmarkerResult,
  GestureRecognizerResult,
} from '@mediapipe/tasks-vision'
import type { StartedResource } from 'braided'
import { defineResource } from 'braided'
import type {
  DetectionResult,
  FaceResult,
  GestureResult,
} from '../../vocabulary/detectionSchemas'
import { writeDetectionResults } from '../../shared/detectionWrite'
import type { WorkerStoreResource } from './workerStore'
import type { WorkerVisionResource } from './workerVision'
import { createSubscription } from '@/lib/state'

// ============================================================================
// Types
// ============================================================================

export type DetectionInput = {
  source: ImageBitmap | OffscreenCanvas
  timestamp: number
}

export type DetectionOutput = DetectionResult

// ============================================================================
// Result Converters (Pure Functions)
// ============================================================================

/**
 * Convert MediaPipe FaceLandmarkerResult to our schema
 */
const convertFaceResult = (result: FaceLandmarkerResult): FaceResult | null => {
  if (result.faceLandmarks.length === 0) return null

  return {
    landmarks: result.faceLandmarks[0].map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility,
    })),
    blendshapes: result.faceBlendshapes?.[0]?.categories.map((cat) => ({
      categoryName: cat.categoryName,
      score: cat.score,
      index: cat.index,
      displayName: cat.displayName,
    })),
    facialTransformationMatrixes: result.facialTransformationMatrixes?.[0]?.data
      ? Array.from(result.facialTransformationMatrixes[0].data)
      : undefined,
  }
}

/**
 * Convert MediaPipe GestureRecognizerResult to our schema
 */
const convertGestureResult = (
  result: GestureRecognizerResult,
): GestureResult | null => {
  if (result.landmarks.length === 0) return null

  return {
    hands: result.landmarks.map((landmarks, i) => ({
      handedness: result.handedness[i]?.[0]?.categoryName || 'Unknown',
      landmarks: landmarks.map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility,
      })),
      worldLandmarks: result.worldLandmarks?.[i]?.map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
      })),
    })),
    gestures: result.gestures.flat().map((gesture) => ({
      categoryName: gesture.categoryName,
      score: gesture.score,
      index: gesture.index,
      displayName: gesture.displayName,
    })),
  }
}

// ============================================================================
// Resource Definition
// ============================================================================

export const workerDetectors = defineResource({
  dependencies: ['workerStore', 'workerVision'],
  start: ({
    workerStore,
    workerVision,
  }: {
    workerStore: WorkerStoreResource
    workerVision: WorkerVisionResource
  }) => {
    console.log('[WorkerDetectors] Starting...')

    // Subscription for detection results
    const resultSubscription = createSubscription<DetectionOutput>()

    // Latest result cache (for SharedArrayBuffer future)
    let latestResult: DetectionOutput | null = null

    // Latest frame from main thread (updated via pushFrame)
    let latestFrame: ImageBitmap | null = null
    let latestFrameTimestamp = 0

    // Track last timestamp used for MediaPipe (must be strictly increasing)
    // MediaPipe requires timestamps in microseconds and strictly monotonic
    let lastMediaPipeTimestamp = 0

    // Worker-owned internal canvas for MediaPipe
    let internalCanvas: OffscreenCanvas | null = null
    let internalCtx: OffscreenCanvasRenderingContext2D | null = null

    /**
     * Initialize internal canvas with given dimensions
     */
    const initializeCanvas = (width: number, height: number) => {
      internalCanvas = new OffscreenCanvas(width, height)
      internalCtx = internalCanvas.getContext('2d')
      console.log('[WorkerDetectors] Internal canvas created:', {
        width,
        height,
      })
    }

    /**
     * Push a new frame from main thread
     * Worker will use this frame for detection on next tick
     */
    const pushFrame = (frame: ImageBitmap, timestamp: number) => {
      // Close previous frame to free memory
      if (latestFrame) {
        latestFrame.close()
      }
      latestFrame = frame
      latestFrameTimestamp = timestamp

      // Resize internal canvas if needed
      if (
        !internalCanvas ||
        internalCanvas.width !== frame.width ||
        internalCanvas.height !== frame.height
      ) {
        initializeCanvas(frame.width, frame.height)
      }
    }

    /**
     * Get a strictly increasing timestamp for MediaPipe
     * MediaPipe requires timestamps to be strictly monotonically increasing
     */
    const getMediaPipeTimestamp = (inputTimestamp: number): number => {
      // Convert to integer milliseconds and ensure strictly increasing
      const timestamp = Math.floor(inputTimestamp)

      if (timestamp <= lastMediaPipeTimestamp) {
        // If timestamp is not increasing, increment from last
        lastMediaPipeTimestamp = lastMediaPipeTimestamp + 1
      } else {
        lastMediaPipeTimestamp = timestamp
      }

      return lastMediaPipeTimestamp
    }

    /**
     * Run detection on a single frame
     * Returns detection result
     *
     * When SharedArrayBuffer is enabled, writes raw MediaPipe results to buffer.
     * Always returns converted result for message passing (can be used as fallback).
     */
    const detect = (input: DetectionInput): DetectionOutput => {
      const start = performance.now()
      const { detectFace, detectHands } = workerStore.getState().detection

      // Get strictly increasing timestamp for MediaPipe
      const mediaPipeTimestamp = getMediaPipeTimestamp(input.timestamp)

      // Raw MediaPipe results (for SharedArrayBuffer)
      let rawFaceResult: FaceLandmarkerResult | null = null
      let rawGestureResult: GestureRecognizerResult | null = null

      // Converted results (for message passing)
      let faceResult: FaceResult | null = null
      let gestureResult: GestureResult | null = null

      try {
        const source = input.source

        // Run face detection
        if (detectFace && workerVision.faceLandmarker) {
          rawFaceResult = workerVision.faceLandmarker.detectForVideo(
            source,
            mediaPipeTimestamp,
          )
          faceResult = convertFaceResult(rawFaceResult)
        }

        // Run hand/gesture detection
        if (detectHands && workerVision.gestureRecognizer) {
          rawGestureResult = workerVision.gestureRecognizer.recognizeForVideo(
            source,
            mediaPipeTimestamp,
          )
          gestureResult = convertGestureResult(rawGestureResult)
        }

        // Write to SharedArrayBuffer if enabled
        const sharedBufferViews = workerStore.getSharedBufferViews()
        if (sharedBufferViews) {
          writeDetectionResults(
            sharedBufferViews,
            rawFaceResult,
            rawGestureResult,
            input.timestamp,
          )
        }
      } catch (error) {
        console.error('[WorkerDetectors] Detection error:', error)
      }

      const processingTimeMs = performance.now() - start

      const output: DetectionOutput = {
        faceResult,
        gestureResult,
        processingTimeMs,
        timestamp: input.timestamp,
      }

      // Update cache and notify (message passing path)
      latestResult = output
      workerStore.setLastDetectionTime(processingTimeMs)
      workerStore.incrementFrameCount()
      resultSubscription.notify(output)

      return output
    }

    /**
     * Detect from the latest pushed frame
     * Used by workerUpdateLoop each tick
     */
    const detectFromLatestFrame = (): DetectionOutput | null => {
      if (!latestFrame) {
        return null
      }

      // Draw frame to internal canvas for MediaPipe
      if (internalCtx && internalCanvas) {
        internalCtx.drawImage(latestFrame, 0, 0)
      }

      // Run detection on the internal canvas (or directly on bitmap)
      const source = internalCanvas || latestFrame
      return detect({ source, timestamp: latestFrameTimestamp })
    }

    /**
     * Check if we have a frame ready for detection
     */
    const hasFrame = () => latestFrame !== null

    return {
      // Core detection
      detect,
      detectFromLatestFrame,
      hasFrame,

      // Frame management
      pushFrame,
      initializeCanvas,

      // Result access
      getLatestResult: () => latestResult,
      onResult: resultSubscription.subscribe,

      // Cleanup
      cleanup: () => {
        if (latestFrame) {
          latestFrame.close()
          latestFrame = null
        }
        resultSubscription.clear()
      },
    }
  },
  halt: (api) => {
    console.log('[WorkerDetectors] Halting...')
    api.cleanup()
  },
})

export type WorkerDetectorsResource = StartedResource<typeof workerDetectors>

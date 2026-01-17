/**
 * Worker Detectors Resource
 *
 * Runs MediaPipe detection on video frames.
 * Worker owns its internal canvas - main thread sends ImageBitmap frames.
 * Writes results to SharedArrayBuffer (zero-copy).
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
import { writeDetectionResults } from '../../shared/detectionWrite'
import type { WorkerStoreResource } from './workerStore'
import type { WorkerVisionResource } from './workerVision'

// ============================================================================
// Types
// ============================================================================

export type DetectionInput = {
  source: ImageBitmap | OffscreenCanvas
  timestamp: number
  workerFPS?: number
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
     * Writes raw MediaPipe results directly to SharedArrayBuffer (zero-copy)
     */
    const detect = (input: DetectionInput): void => {
      const start = performance.now()
      const { detectFace, detectHands } = workerStore.getState().detection

      // Get strictly increasing timestamp for MediaPipe
      const mediaPipeTimestamp = getMediaPipeTimestamp(input.timestamp)

      // Raw MediaPipe results
      let rawFaceResult: FaceLandmarkerResult | null = null
      let rawGestureResult: GestureRecognizerResult | null = null

      try {
        const source = input.source

        // Run face detection
        if (detectFace && workerVision.faceLandmarker) {
          rawFaceResult = workerVision.faceLandmarker.detectForVideo(
            source,
            mediaPipeTimestamp,
          )
        }

        // Run hand/gesture detection
        if (detectHands && workerVision.gestureRecognizer) {
          rawGestureResult = workerVision.gestureRecognizer.recognizeForVideo(
            source,
            mediaPipeTimestamp,
          )
        }

        // Write to SharedArrayBuffer (zero-copy!)
        const sharedBufferViews = workerStore.getSharedBufferViews()
        if (sharedBufferViews) {
          writeDetectionResults(
            sharedBufferViews,
            rawFaceResult,
            rawGestureResult,
            input.timestamp,
            input.workerFPS, // Pass FPS from workerUpdateLoop
          )
        }
      } catch (error) {
        console.error('[WorkerDetectors] Detection error:', error)
      }

      const processingTimeMs = performance.now() - start
      workerStore.setLastDetectionTime(processingTimeMs)
      workerStore.incrementFrameCount()
    }

    /**
     * Detect from the latest pushed frame
     * Used by workerUpdateLoop each tick
     */
    const detectFromLatestFrame = (workerFPS?: number): void => {
      if (!latestFrame) {
        return
      }

      // Draw frame to internal canvas for MediaPipe
      if (internalCtx && internalCanvas) {
        internalCtx.drawImage(latestFrame, 0, 0)
      }

      // Run detection on the internal canvas (or directly on bitmap)
      const source = internalCanvas || latestFrame
      detect({ source, timestamp: latestFrameTimestamp, workerFPS })
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

      // Cleanup
      cleanup: () => {
        if (latestFrame) {
          latestFrame.close()
          latestFrame = null
        }
      },
    }
  },
  halt: (api) => {
    console.log('[WorkerDetectors] Halting...')
    api.cleanup()
  },
})

export type WorkerDetectorsResource = StartedResource<typeof workerDetectors>

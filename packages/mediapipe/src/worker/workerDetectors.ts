/**
 * Worker Detectors Resource
 *
 * Runs MediaPipe detection on video frames.
 * Worker owns its internal canvas - main thread sends VideoFrame (244x faster than ImageBitmap).
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
import { normalizedToCellByResolution } from '@handwave/intent-engine'
import type { WorkerStoreResource } from './workerStore'
import type { WorkerVisionResource } from './workerVision'
import { writeDetectionResults } from '../shared/detectionWrite'
import { transformToRawFrame } from '../adapter/transformMediaPipe'
import type { HandSpatialInfo } from '../vocabulary/detectionSchemas'

// ============================================================================
// Types
// ============================================================================

export type DetectionInput = {
  source: ImageBitmap | OffscreenCanvas | VideoFrame
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

    // Latest frame timestamp (canvas holds the actual frame data)
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
     * Accepts ImageBitmap or VideoFrame (VideoFrame is 244x faster!)
     * Draws to canvas immediately for RAF loop to detect from
     * Natural frame dropping: new frames overwrite canvas
     */
    const pushFrame = (frame: ImageBitmap | VideoFrame, timestamp: number) => {
      // Update timestamp for this frame
      latestFrameTimestamp = timestamp

      // Get dimensions based on frame type
      // VideoFrame uses displayWidth/displayHeight, ImageBitmap uses width/height
      const frameWidth = 'displayWidth' in frame ? frame.displayWidth : frame.width
      const frameHeight = 'displayHeight' in frame ? frame.displayHeight : frame.height

      // Resize internal canvas if needed
      if (
        !internalCanvas ||
        internalCanvas.width !== frameWidth ||
        internalCanvas.height !== frameHeight
      ) {
        initializeCanvas(frameWidth, frameHeight)
      }

      // Natural frame dropping: new frames overwrite canvas
      if (internalCtx && internalCanvas) {
        internalCtx.drawImage(frame, 0, 0)
      }

      // Close the frame immediately - data is now in canvas
      // CRITICAL: Must close to prevent memory leaks
      frame.close()
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
     * Returns spatial data for progress event reporting
     */
    const detect = (input: DetectionInput): Array<HandSpatialInfo> | null => {
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

        // Transform MediaPipe results to canonical format
        const rawFrame = transformToRawFrame(
          rawGestureResult,
          rawFaceResult,
          input.timestamp,
        )

        // Write to SharedArrayBuffer (zero-copy!)
        const sharedBufferViews = workerStore.getSharedBufferViews()
        if (sharedBufferViews) {
          writeDetectionResults(
            sharedBufferViews,
            rawFrame,
            input.workerFPS, // Pass FPS separately for buffer metadata
          )
        }

        // Spatial hash update (returns data for progress event)
        const spatialData = updateSpatialHash(
          workerStore,
          rawGestureResult,
          input.timestamp,
        )

        return spatialData
      } catch (error) {
        console.error('[WorkerDetectors] Detection error:', error)
        return null
      }
    }

    /**
     * Detect from the internal canvas
     * Canvas contains the latest frame data (drawn in pushFrame)
     * Returns spatial data for progress event reporting
     */
    const detectFromLatestFrame = (workerFPS?: number): Array<HandSpatialInfo> | null => {
      // Check if we have a canvas with frame data
      if (!internalCanvas) {
        return null
      }

      // Run detection on the internal canvas
      // Frame data was already drawn to canvas in pushFrame
      return detect({ source: internalCanvas, timestamp: latestFrameTimestamp, workerFPS })
    }

    /**
     * Check if we have a frame ready for detection
     */
    const hasFrame = () => internalCanvas !== null

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
        // Canvas cleanup happens automatically
        // No ImageBitmap references to close
      },
    }
  },
  halt: (api) => {
    console.log('[WorkerDetectors] Halting...')
    api.cleanup()
  },
})

export type WorkerDetectorsResource = StartedResource<typeof workerDetectors>

// ============================================================================
// Spatial Hash Update Helper
// ============================================================================

/**
 * Update spatial hash with hand positions
 * Returns spatial data for progress event reporting
 * 
 * CRITICAL: Applies dead zone transformation and mirroring BEFORE calculating cells
 * This ensures worker and main thread calculate in the SAME coordinate space
 */
function updateSpatialHash(
  workerStore: WorkerStoreResource,
  gestureResult: GestureRecognizerResult | null,
  _timestamp: number,
): Array<HandSpatialInfo> | null {
  const spatialHash = workerStore.getSpatialHash()
  const spatialConfig = workerStore.getState().spatial
  const displayContext = workerStore.getState().displayContext

  if (!spatialHash || !spatialConfig.enabled || !gestureResult) {
    return null
  }

  // Clear previous frame (fresh state each frame)
  spatialHash.clearAll()

  // Extract and insert hand positions
  const handSpatialInfo: Array<HandSpatialInfo> = []

  for (let i = 0; i < gestureResult.landmarks.length; i++) {
    const landmarks = gestureResult.landmarks[i]
    const trackedLandmark = landmarks[spatialConfig.trackedLandmarkIndex]

    if (trackedLandmark) {
      // Step 1: Start with MediaPipe normalized coordinates (0-1)
      const rawX = trackedLandmark.x
      const rawY = trackedLandmark.y
      const rawZ = trackedLandmark.z

      // Step 2: Apply mirroring FIRST (in raw normalized space)
      // This matches what visualization does: mirror before dead zone transform
      const mirroredX = displayContext.mirrored ? 1 - rawX : rawX
      const mirroredY = rawY

      // Step 3: Apply dead zone transformation to get safe-zone-normalized coordinates
      const deadZones = displayContext.deadZones
      const safeNormalizedX = (mirroredX - deadZones.left) / (1 - deadZones.left - deadZones.right)
      const safeNormalizedY = (mirroredY - deadZones.top) / (1 - deadZones.top - deadZones.bottom)

      // Step 4: Create position in SAFE ZONE coordinate space
      // Now worker and visualization are in the SAME space!
      const position = {
        x: safeNormalizedX,
        y: safeNormalizedY,
        z: rawZ, // Z doesn't need transformation
      }

      // Insert into spatial hash (all resolutions)
      spatialHash.insertAll(position, { handIndex: i })

      // Calculate cells from safe-zone-normalized coordinates
      // These cells now MATCH what the visualization will calculate!
      handSpatialInfo.push({
        handIndex: i,
        landmarkIndex: spatialConfig.trackedLandmarkIndex,
        cells: {
          coarse: normalizedToCellByResolution(position, 'coarse'),
          medium: normalizedToCellByResolution(position, 'medium'),
          fine: normalizedToCellByResolution(position, 'fine'),
        },
      })
    }
  }

  return handSpatialInfo.length > 0 ? handSpatialInfo : null
}

/**
 * Detection Worker Client Resource
 *
 * Worker-driven architecture with zero-copy detection results via SharedArrayBuffer.
 * Worker runs its own detection loop, main thread sends video frames as VideoFrame (244x faster than ImageBitmap).
 *
 * REQUIREMENTS:
 * - SharedArrayBuffer support (all modern browsers)
 * - crossOriginIsolated context (COOP/COEP headers)
 * - Vite automatically configures headers in dev/preview modes
 *
 * This resource:
 * - Initializes the worker braided system
 * - Sends video frames to worker via pushFrame (zero-copy transfer)
 * - Starts/stops the worker's detection loop
 * - Provides zero-copy detection results via SharedArrayBuffer
 * - Integrates with the Braided resource system
 */

import type { StartedResource } from 'braided'
import { defineResource } from 'braided'
import { createClientResource, createSubscription } from '@handwave/system'
import { systemTasks } from '../worker/kernel/systemTasks'
import { detectionKeywords } from '../vocabulary/detectionKeywords'
import type { SpatialUpdateMessage } from '../vocabulary/detectionSchemas'
import {
  createDetectionBufferViews,
  createDetectionSharedBuffer,
  getSharedArrayBufferStatus,
} from '../shared/detectionBuffer'
import type { DetectionBufferViews } from '../shared/detectionBuffer'
import { reconstructDetectionResults } from '../shared/detectionReconstruct'

// Model URLs (CDN-hosted MediaPipe models)
const MODEL_PATHS = {
  faceLandmarker:
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  gestureRecognizer:
    'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  visionWasmPath:
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
}

// Create the worker client with system tasks only
const workerClient = createClientResource(
  () => import('../worker/kernel/workerScript?worker'),
  systemTasks,
)

/**
 * Detection worker client resource
 *
 * Usage in system:
 *   const system = {
 *     detectionWorker: detectionWorkerResource,
 *     // ... other resources
 *   }
 *
 * Usage in code:
 *   const worker = useResource('detectionWorker')
 *   await worker.initialize()
 *   worker.startDetection()
 *   // In render loop:
 *   worker.pushFrame(imageBitmap, timestamp)
 *   const results = worker.readDetectionResults() // Zero-copy!
 */
export const detectionWorkerResource = defineResource({
  dependencies: [],
  start: async () => {
    console.log('[Detection Worker Resource] Starting...')

    // Start the worker
    const worker = workerClient.start()

    // Wait for worker to be ready
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        const status = worker.getStatus()
        if (status === 'ready') {
          resolve()
        } else if (status === 'error' || status === 'terminated') {
          throw new Error(`Worker failed to start: ${status}`)
        } else {
          setTimeout(checkReady, 100)
        }
      }
      checkReady()
    })

    console.log('[Detection Worker Resource] ✅ Worker ready')

    // Track initialization state
    let initialized = false

    // SharedArrayBuffer state
    let sharedBufferViews: DetectionBufferViews | null = null
    let sharedBufferEnabled = false

    // Spatial update subscription
    const spatialUpdateSubscription = createSubscription<SpatialUpdateMessage>()

    /**
     * Initialize the worker braided system and load models
     * Requires SharedArrayBuffer support - will throw if not available
     */
    const initialize = async (options?: {
      targetFPS?: number
      detectFace?: boolean
      detectHands?: boolean
    }): Promise<void> => {
      console.log('[Detection Worker Resource] Initializing...')

      // Check SharedArrayBuffer support FIRST
      const sabStatus = getSharedArrayBufferStatus()
      if (!sabStatus.supported) {
        const errorMessage =
          `SharedArrayBuffer is required but not available.\n\n` +
          `Reason: ${sabStatus.reason}\n` +
          `crossOriginIsolated: ${sabStatus.crossOriginIsolated}\n\n` +
          `To fix this:\n` +
          `1. Ensure your server sends these headers:\n` +
          `   Cross-Origin-Opener-Policy: same-origin\n` +
          `   Cross-Origin-Embedder-Policy: require-corp\n` +
          `2. Restart your dev server\n` +
          `3. Hard refresh your browser (Cmd+Shift+R or Ctrl+Shift+R)`

        console.error('[Detection Worker Resource]', errorMessage)
        throw new Error(errorMessage)
      }

      console.log(
        '[Detection Worker Resource] ✅ SharedArrayBuffer available',
        { crossOriginIsolated: sabStatus.crossOriginIsolated },
      )

      // Initialize the worker braided system
      await new Promise<void>((resolve, reject) => {
        worker
          .dispatch(detectionKeywords.tasks.initializeWorker, {
            modelPaths: MODEL_PATHS,
            faceLandmarkerConfig: {
              numFaces: 1, // Support up to 2 faces
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
            },
            gestureRecognizerConfig: {
              numHands: 2, // Support up to 4 hands
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            },
            targetFPS: options?.targetFPS ?? 30,
          })
          .onComplete((result) => {
            if (result.success) {
              console.log(
                `[Detection Worker Resource] ✅ System initialized in ${result.initTimeMs?.toFixed(0)}ms`,
              )
              resolve()
            } else {
              reject(new Error(result.message))
            }
          })
          .onError((error) => {
            reject(new Error(error))
          })
      })

      // Initialize SharedArrayBuffer (mandatory for zero-copy detection)
      console.log(
        '[Detection Worker Resource] Initializing SharedArrayBuffer...',
      )

      // Create the shared buffer
      const { buffer, layout } = createDetectionSharedBuffer()

      // Create views for main thread
      sharedBufferViews = createDetectionBufferViews(buffer, layout)

      // Send buffer to worker
      await new Promise<void>((resolve, reject) => {
        worker
          .dispatch(detectionKeywords.tasks.attachSharedBuffer, {
            buffer,
            layout,
          })
          .onComplete((result) => {
            if (result.attached) {
              console.log(
                `[Detection Worker Resource] ✅ SharedArrayBuffer attached (${result.bufferSize} bytes)`,
              )
              sharedBufferEnabled = true
              resolve()
            } else {
              reject(new Error('Failed to attach SharedArrayBuffer'))
            }
          })
          .onError((error) => {
            reject(new Error(error))
          })
      })

      initialized = true
      console.log('[Detection Worker Resource] ✅ Ready for detection')
    }

    /**
     * Read detection results directly from SharedArrayBuffer
     * Returns null if SharedArrayBuffer is not enabled or no data available
     * This is zero-copy - no message passing overhead!
     */
    const readDetectionResults = (): {
      faceResult: ReturnType<typeof reconstructDetectionResults>['faceResult']
      gestureResult: ReturnType<
        typeof reconstructDetectionResults
      >['gestureResult']
      timestamp: number
      workerFPS: number
    } | null => {
      if (!sharedBufferEnabled || !sharedBufferViews) {
        return null
      }

      return reconstructDetectionResults(sharedBufferViews)
    }

    /**
     * Check if SharedArrayBuffer mode is enabled
     */
    const isSharedBufferEnabled = (): boolean => sharedBufferEnabled

    /**
     * Get the SharedArrayBuffer views (for advanced usage)
     */
    const getSharedBufferViews = (): DetectionBufferViews | null =>
      sharedBufferViews

    /**
     * Push a video frame to the worker
     * Accepts ImageBitmap or VideoFrame (VideoFrame is 244x faster!)
     * Worker will use this frame for detection on next tick
     * Frame is transferred (zero-copy)
     */
    const pushFrame = (frame: ImageBitmap | VideoFrame, timestamp: number): void => {
      if (!initialized) {
        return // Silently ignore if not initialized
      }

      worker.dispatch(
        detectionKeywords.tasks.pushFrame,
        { frame, timestamp },
        [frame], // Transfer works for both types (zero-copy)
      )
    }

    /**
     * Start the detection loop
     * Results are available via readDetectionResults() (zero-copy SharedArrayBuffer)
     */
    const startDetection = (): void => {
      if (!initialized) {
        console.warn(
          '[Detection Worker Resource] Not initialized. Call initialize() first.',
        )
        return
      }

      worker
        .dispatch(detectionKeywords.tasks.startDetection, {})
        .onComplete(() => {
          console.log('[Detection Worker Resource] Detection loop started')
        })
        .onProgress((progress) => {
          // Forward spatial updates to subscribers
          if (progress.type === 'spatialUpdate') {
            spatialUpdateSubscription.notify({
              type: 'spatialUpdate',
              timestamp: progress.timestamp,
              hands: progress.hands,
            })
          }
        })
        .onError((error) => {
          console.error(
            '[Detection Worker Resource] Failed to start detection:',
            error,
          )
        })
    }

    /**
     * Stop the detection loop
     */
    const stopDetection = (): void => {
      worker
        .dispatch(detectionKeywords.tasks.stopDetection, {})
        .onComplete(() => {
          console.log('[Detection Worker Resource] Detection loop stopped')
        })
    }

    /**
     * Send command to worker
     */
    const sendCommand = (
      command:
        | { type: 'start' }
        | { type: 'stop' }
        | { type: 'pause' }
        | { type: 'resume' }
        | { type: 'setTargetFPS'; fps: number }
        | {
            type: 'setDetectionSettings'
            detectFace?: boolean
            detectHands?: boolean
          },
    ): void => {
      worker.dispatch(detectionKeywords.tasks.command, { command })
    }

    /**
     * Update viewport dimensions in worker
     * Worker uses this to compute grid config for spatial patterns
     */
    const updateViewport = (viewport: {
      x: number
      y: number
      width: number
      height: number
    }): void => {
      // Skip if worker not initialized yet
      if (!initialized) {
        return
      }

      worker
        .dispatch(detectionKeywords.tasks.updateViewport, viewport)
        .onComplete(() => {
          console.log('[Detection Worker Resource] Viewport updated:', viewport)
        })
        .onError((error) => {
          console.error(
            '[Detection Worker Resource] Failed to update viewport:',
            error,
          )
        })
    }

    /**
     * Update display context (dead zones, mirrored state)
     * Syncs display state to worker for correct coordinate space calculations
     */
    const updateDisplayContext = (context: {
      deadZones: {
        top: number
        bottom: number
        left: number
        right: number
      }
      mirrored: boolean
    }): void => {
      // Skip if worker not initialized yet
      if (!initialized) {
        console.log('updateDisplayContext skipped: worker not initialized')
        return
      }

      worker
        .dispatch(detectionKeywords.tasks.updateDisplayContext, context)
        .onComplete(() => {
          // no-op
        })
        .onError((error) => {
          console.error(
            '[Detection Worker Resource] Failed to update display context:',
            error,
          )
        })
    }

    // Return the worker API
    return {
      // Core API
      initialize,
      pushFrame,
      startDetection,
      stopDetection,
      sendCommand,
      updateViewport,
      updateDisplayContext,
      isInitialized: () => initialized,

      // SharedArrayBuffer API (zero-copy detection results)
      readDetectionResults,
      isSharedBufferEnabled,
      getSharedBufferViews,

      // Spatial update subscription
      onSpatialUpdate: spatialUpdateSubscription.subscribe,

      // Base worker API (for advanced usage)
      dispatch: worker.dispatch,
      getStatus: worker.getStatus,
      terminate: worker.terminate,

      // Cleanup
      cleanup: () => {
        spatialUpdateSubscription.clear()
        sharedBufferViews = null
        sharedBufferEnabled = false
      },
    }
  },
  halt: (worker) => {
    console.log('[Detection Worker Resource] Halting...')
    worker.cleanup()

    if (worker.isInitialized()) {
      worker.dispatch(detectionKeywords.tasks.haltWorker, {})
    }

    worker.terminate()
  },
})

export type DetectionWorkerResource = StartedResource<typeof detectionWorkerResource>

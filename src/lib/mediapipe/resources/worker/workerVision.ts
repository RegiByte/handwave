/**
 * Worker Vision Resource
 *
 * Encapsulates MediaPipe model initialization and management.
 * Owns FaceLandmarker and GestureRecognizer instances.
 *
 * Key responsibility: Handle the ModuleFactory workaround for MediaPipe
 * in Web Workers (importScripts compatibility issue).
 *
 * Credit: https://github.com/google-ai-edge/mediapipe/issues/4011#issuecomment-1819075764
 */

import { defineResource } from 'braided'
import type { StartedResource } from 'braided'
import {
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
} from '@mediapipe/tasks-vision'
import type { WorkerStoreResource } from './workerStore'

// ============================================================================
// Types
// ============================================================================

export type VisionRuntime = Awaited<
  ReturnType<typeof FilesetResolver.forVisionTasks>
>

export type WorkerVisionState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  modelsLoaded: Array<string>
  initTimeMs: number
}

// ============================================================================
// ModuleFactory Workaround
// ============================================================================

/**
 * Store the WASM loader script for reuse.
 * MediaPipe's ModuleFactory gets consumed after each model creation,
 * so we need to reload it before creating each model.
 */
let wasmLoaderScript: string | null = null

/**
 * Ensure ModuleFactory is available in globalThis.
 * This is the workaround for MediaPipe's importScripts issue in ES module workers.
 *
 * How it works:
 * 1. Fetch the WASM loader script from the vision runtime
 * 2. Cache it for reuse
 * 3. Execute via indirect eval to set globalThis.ModuleFactory
 * 4. Delete wasmLoaderPath so MediaPipe doesn't try importScripts
 */
async function ensureModuleFactory(visionRuntime: VisionRuntime): Promise<void> {
  // If we haven't cached the loader script yet, fetch and cache it
  if (!wasmLoaderScript && (visionRuntime as any).wasmLoaderPath) {
    console.log('[WorkerVision] Fetching WASM loader script...')
    const response = await fetch((visionRuntime as any).wasmLoaderPath)
    wasmLoaderScript = await response.text()
    // Remove the path so MediaPipe doesn't try to use importScripts
    delete (visionRuntime as any).wasmLoaderPath
  }

  // Execute the loader script to set globalThis.ModuleFactory
  if (wasmLoaderScript) {
    const indirectEval = eval
    indirectEval(wasmLoaderScript)
  }
}

// ============================================================================
// Resource Definition
// ============================================================================

export const workerVision = defineResource({
  dependencies: ['workerStore'],
  start: async ({ workerStore }: { workerStore: WorkerStoreResource }) => {
    console.log('[WorkerVision] Starting...')

    const config = workerStore.getState().config
    const start = performance.now()
    const modelsLoaded: Array<string> = []

    let vision: VisionRuntime | null = null
    let faceLandmarker: FaceLandmarker | null = null
    let gestureRecognizer: GestureRecognizer | null = null

    try {
      // Initialize vision runtime
      console.log('[WorkerVision] Initializing vision runtime...')
      vision = await FilesetResolver.forVisionTasks(config.modelPaths.visionWasmPath)
      console.log('[WorkerVision] Vision runtime loaded')

      // Initialize face landmarker
      console.log('[WorkerVision] Loading face landmarker...')
      await ensureModuleFactory(vision)
      const faceConfig = config.faceLandmarker
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: config.modelPaths.faceLandmarker,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: faceConfig.numFaces ?? 1,
        minFaceDetectionConfidence: faceConfig.minFaceDetectionConfidence ?? 0.5,
        minFacePresenceConfidence: faceConfig.minFacePresenceConfidence ?? 0.5,
        minTrackingConfidence: faceConfig.minTrackingConfidence ?? 0.5,
        outputFaceBlendshapes: faceConfig.outputFaceBlendshapes ?? true,
        outputFacialTransformationMatrixes:
          faceConfig.outputFacialTransformationMatrixes ?? true,
      })
      modelsLoaded.push('faceLandmarker')
      console.log('[WorkerVision] Face landmarker loaded')

      // Initialize gesture recognizer
      console.log('[WorkerVision] Loading gesture recognizer...')
      await ensureModuleFactory(vision) // Reload ModuleFactory for second model
      const gestureConfig = config.gestureRecognizer
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: config.modelPaths.gestureRecognizer,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: gestureConfig.numHands ?? 2,
        minHandDetectionConfidence: gestureConfig.minHandDetectionConfidence ?? 0.5,
        minHandPresenceConfidence: gestureConfig.minHandPresenceConfidence ?? 0.5,
        minTrackingConfidence: gestureConfig.minTrackingConfidence ?? 0.5,
      })
      modelsLoaded.push('gestureRecognizer')
      console.log('[WorkerVision] Gesture recognizer loaded')

      const initTimeMs = performance.now() - start
      console.log(
        `[WorkerVision] ✅ All models loaded in ${initTimeMs.toFixed(0)}ms`,
      )

      // Mark as initialized in store
      workerStore.setInitialized(true)

      return {
        vision,
        faceLandmarker,
        gestureRecognizer,
        modelsLoaded,
        initTimeMs,

        // Getters
        getFaceLandmarker: () => faceLandmarker,
        getGestureRecognizer: () => gestureRecognizer,
        isReady: () => faceLandmarker !== null && gestureRecognizer !== null,
      }
    } catch (error) {
      console.error('[WorkerVision] Failed to initialize:', error)
      throw error
    }
  },
  halt: (api) => {
    console.log('[WorkerVision] Halting...')
    // MediaPipe models have close() methods for cleanup
    api.faceLandmarker?.close()
    api.gestureRecognizer?.close()
  },
})

export type WorkerVisionResource = StartedResource<typeof workerVision>


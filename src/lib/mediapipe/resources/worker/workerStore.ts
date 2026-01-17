/**
 * Worker Store Resource
 *
 * Worker-local state management for MediaPipe detection.
 * Stores configuration, detection settings, and runtime state.
 *
 * Philosophy: Worker owns its own state. Main thread sends commands,
 * worker manages its internal state independently.
 */

import { defineResource } from 'braided'
import type {
  FaceLandmarkerConfig,
  GestureRecognizerConfig,
  ModelPaths,
} from '../../vocabulary/detectionSchemas'
import type { DetectionBufferViews } from '../../shared/detectionBuffer'
import { createAtom } from '@/lib/state'

// ============================================================================
// State Types
// ============================================================================

export type WorkerStoreState = {
  // Configuration
  config: {
    modelPaths: ModelPaths
    faceLandmarker: FaceLandmarkerConfig
    gestureRecognizer: GestureRecognizerConfig
  }

  // Runtime state
  runtime: {
    initialized: boolean
    running: boolean
    paused: boolean
    frameCount: number
    lastDetectionTimeMs: number
  }

  // Detection settings (can be toggled at runtime)
  detection: {
    detectFace: boolean
    detectHands: boolean
    targetFPS: number
  }

  // SharedArrayBuffer mode (when enabled, results written to buffer)
  sharedBuffer: {
    enabled: boolean
  }
}

// ============================================================================
// Default State
// ============================================================================

const defaultModelPaths: ModelPaths = {
  faceLandmarker:
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  gestureRecognizer:
    'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  visionWasmPath:
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
}

const defaultFaceLandmarkerConfig: FaceLandmarkerConfig = {
  numFaces: 2, // Support up to 2 faces
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
}

const defaultGestureRecognizerConfig: GestureRecognizerConfig = {
  numHands: 4, // Support up to 4 hands
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
}

const createDefaultState = (): WorkerStoreState => ({
  config: {
    modelPaths: defaultModelPaths,
    faceLandmarker: defaultFaceLandmarkerConfig,
    gestureRecognizer: defaultGestureRecognizerConfig,
  },
  runtime: {
    initialized: false,
    running: false,
    paused: false,
    frameCount: 0,
    lastDetectionTimeMs: 0,
  },
  detection: {
    detectFace: true,
    detectHands: true,
    targetFPS: 30,
  },
  sharedBuffer: {
    enabled: false,
  },
})

// ============================================================================
// Resource Definition
// ============================================================================

export const createWorkerStore = (initialState?: Partial<WorkerStoreState>) =>
  defineResource({
    dependencies: [],
    start: () => {
      const defaultState = createDefaultState()
      const mergedState: WorkerStoreState = {
        ...defaultState,
        ...initialState,
        config: {
          ...defaultState.config,
          ...initialState?.config,
        },
        runtime: {
          ...defaultState.runtime,
          ...initialState?.runtime,
        },
        detection: {
          ...defaultState.detection,
          ...initialState?.detection,
        },
        sharedBuffer: {
          ...defaultState.sharedBuffer,
          ...initialState?.sharedBuffer,
        },
      }

      const store = createAtom<WorkerStoreState>(mergedState)

      // SharedArrayBuffer views (stored outside of atom for performance)
      let sharedBufferViews: DetectionBufferViews | null = null

      console.log('[WorkerStore] Initialized with state:', store.get())

      return {
        store,
        getState: () => store.get(),

        // SharedArrayBuffer management
        setSharedBufferViews: (views: DetectionBufferViews | null) => {
          sharedBufferViews = views
          store.mutate((s) => {
            s.sharedBuffer.enabled = views !== null
          })
          console.log(
            '[WorkerStore] SharedArrayBuffer',
            views ? 'enabled' : 'disabled',
          )
        },

        getSharedBufferViews: () => sharedBufferViews,

        isSharedBufferEnabled: () => store.get().sharedBuffer.enabled,

        // Config updates
        updateConfig: (
          config: Partial<WorkerStoreState['config']>,
        ) => {
          store.mutate((s) => {
            if (config.modelPaths) {
              s.config.modelPaths = { ...s.config.modelPaths, ...config.modelPaths }
            }
            if (config.faceLandmarker) {
              s.config.faceLandmarker = { ...s.config.faceLandmarker, ...config.faceLandmarker }
            }
            if (config.gestureRecognizer) {
              s.config.gestureRecognizer = { ...s.config.gestureRecognizer, ...config.gestureRecognizer }
            }
          })
        },

        // Runtime state updates
        setInitialized: (initialized: boolean) => {
          store.mutate((s) => {
            s.runtime.initialized = initialized
          })
        },

        setRunning: (running: boolean) => {
          store.mutate((s) => {
            s.runtime.running = running
          })
        },

        setPaused: (paused: boolean) => {
          store.mutate((s) => {
            s.runtime.paused = paused
          })
        },

        incrementFrameCount: () => {
          store.mutate((s) => {
            s.runtime.frameCount += 1
          })
        },

        setLastDetectionTime: (timeMs: number) => {
          store.mutate((s) => {
            s.runtime.lastDetectionTimeMs = timeMs
          })
        },

        // Detection settings
        setDetectionSettings: (
          settings: Partial<WorkerStoreState['detection']>,
        ) => {
          store.mutate((s) => {
            Object.assign(s.detection, settings)
          })
        },
      }
    },
    halt: () => {
      console.log('[WorkerStore] Halted')
    },
  })

export type WorkerStoreResource = ReturnType<
  ReturnType<typeof createWorkerStore>['start']
>


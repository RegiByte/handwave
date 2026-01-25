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
import type { MultiResolutionSpatialHash } from '@handwave/intent-engine';
import { createMultiResolutionSpatialHash } from '@handwave/intent-engine'
import type {
  DeadZones,
  FaceLandmarkerConfig,
  GestureRecognizerConfig,
  GridResolution,
  ModelPaths,
} from '../vocabulary/detectionSchemas'
import type { DetectionBufferViews } from '../shared/detectionBuffer'
import { createAtom } from '@handwave/system'

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

  // Viewport dimensions (synced from main thread)
  viewport: {
    x: number
    y: number
    width: number
    height: number
  }

  // Spatial tracking state
  spatial: {
    enabled: boolean
    gridResolution: GridResolution | 'all'
    trackedLandmarkIndex: number // 8 = index finger tip
  }

  // Display context (synced from main thread)
  // Needed for correct coordinate space calculations
  displayContext: {
    deadZones: DeadZones
    mirrored: boolean
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
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
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
  viewport: {
    x: 0,
    y: 0,
    width: 640,
    height: 480,
  },
  spatial: {
    enabled: true,
    gridResolution: 'all',
    trackedLandmarkIndex: 8, // Index finger tip
  },
  displayContext: {
    deadZones: {
      top: 0.05,
      bottom: 0.15,
      left: 0.05,
      right: 0.05,
    },
    mirrored: true, // Default to mirrored (selfie mode, matches loop/runtime defaults)
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
        viewport: {
          ...defaultState.viewport,
          ...initialState?.viewport,
        },
      }

      const store = createAtom<WorkerStoreState>(mergedState)

      // SharedArrayBuffer views (stored outside of atom for performance)
      let sharedBufferViews: DetectionBufferViews | null = null

      // Spatial hash (stored outside of atom for performance)
      type HandData = { handIndex: number }
      const spatialHash: MultiResolutionSpatialHash<HandData> | null =
        createMultiResolutionSpatialHash<HandData>()

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
        updateConfig: (config: Partial<WorkerStoreState['config']>) => {
          store.mutate((s) => {
            if (config.modelPaths) {
              s.config.modelPaths = {
                ...s.config.modelPaths,
                ...config.modelPaths,
              }
            }
            if (config.faceLandmarker) {
              s.config.faceLandmarker = {
                ...s.config.faceLandmarker,
                ...config.faceLandmarker,
              }
            }
            if (config.gestureRecognizer) {
              s.config.gestureRecognizer = {
                ...s.config.gestureRecognizer,
                ...config.gestureRecognizer,
              }
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

        // Viewport management
        setViewport: (viewport: WorkerStoreState['viewport']) => {
          store.mutate((s) => {
            s.viewport = viewport
          })
          console.log('[WorkerStore] Viewport updated:', viewport)
        },

        getViewport: () => store.get().viewport,

        // Display context management
        setDisplayContext: (context: Partial<WorkerStoreState['displayContext']>) => {
          store.mutate((s) => {
            Object.assign(s.displayContext, context)
          })
          console.log('[WorkerStore] Display context updated:', context)
        },

        setDeadZones: (deadZones: DeadZones) => {
          store.mutate((s) => {
            s.displayContext.deadZones = deadZones
          })
          console.log('[WorkerStore] Dead zones updated:', deadZones)
        },

        setMirrored: (mirrored: boolean) => {
          store.mutate((s) => {
            s.displayContext.mirrored = mirrored
          })
          console.log('[WorkerStore] Mirrored updated:', mirrored)
        },

        // Spatial hash management
        getSpatialHash: () => spatialHash,

        setSpatialEnabled: (enabled: boolean) => {
          store.mutate((s) => {
            s.spatial.enabled = enabled
          })
          console.log(
            '[WorkerStore] Spatial tracking',
            enabled ? 'enabled' : 'disabled',
          )
        },

        setGridResolution: (resolution: GridResolution | 'all') => {
          store.mutate((s) => {
            s.spatial.gridResolution = resolution
          })
          console.log('[WorkerStore] Grid resolution set to:', resolution)
        },

        setTrackedLandmark: (index: number) => {
          store.mutate((s) => {
            s.spatial.trackedLandmarkIndex = index
          })
          console.log('[WorkerStore] Tracked landmark index set to:', index)
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

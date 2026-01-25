/**
 * @handwave/mediapipe
 * 
 * MediaPipe detection adapter for HandWave.
 * Provides hand and face tracking using Google's MediaPipe.
 * 
 * @example
 * ```typescript
 * import { cameraResource, detectionWorkerResource, loopResource } from '@handwave/mediapipe'
 * 
 * // Use resources in your Braided system
 * const system = {
 *   camera: cameraResource,
 *   detectionWorker: detectionWorkerResource,
 *   loop: loopResource,
 * }
 * ```
 */

// ============================================================================
// Detection Resources
// ============================================================================

export {
  createCameraResource,
  cameraResource,
  type CameraConfig,
  type CameraDeviceSelection,
  type CameraAPI,
  type CameraState,
} from './detection/camera'

export {
  createVisionResource,
  type VisionRuntimeState,
  type VisionRuntimeAPI,
} from './detection/vision'

export {
  detectionWorkerResource,
  type DetectionWorkerResource,
} from './detection/detectionWorker'

export {
  createGestureRecognizerResource,
  gestureRecognizerResource,
  type GestureRecognizerState,
  type GestureRecognizerAPI,
} from './detection/gesture-recognizer'

export {
  createFaceLandmarkerResource,
  faceLandmarkerResource,
} from './detection/face-landmarker'

export {
  loopResource,
  type LoopResource,
  type LoopState,
  type LoopDependencies,
  type FrameData,
} from './detection/loop'

export {
  canvasResource,
  type CanvasAPI,
} from './detection/canvas'

export {
  frameRater,
  type FrameRaterAPI,
  type ExecutionStrategy,
  type FixedTimestepConfig,
  type VariableTimestepConfig,
  type ThrottledConfig,
  type ExecutorMetrics,
  type FixedTimestepExecutor,
  type VariableTimestepExecutor,
  type ThrottledExecutor,
} from './detection/frameRater'

// ============================================================================
// Shared Buffer Utilities
// ============================================================================

export {
  // Constants
  MAX_FACES,
  MAX_HANDS,
  FACE_LANDMARKS_COUNT,
  HAND_LANDMARKS_COUNT,
  BLENDSHAPES_COUNT,
  LANDMARK_COMPONENTS,
  WORLD_LANDMARK_COMPONENTS,
  TRANSFORMATION_MATRIX_SIZE,
  // Types
  type DetectionBufferLayout,
  type DetectionBufferViews,
  // Buffer creation
  calculateDetectionBufferLayout,
  createDetectionSharedBuffer,
  createDetectionBufferViews,
  // Buffer index operations
  getActiveBufferIndex,
  getInactiveBufferIndex,
  swapDetectionBuffers,
  // Metadata access
  getBufferTimestamp,
  setBufferTimestamp,
  getBufferFaceCount,
  setBufferFaceCount,
  getBufferHandCount,
  setBufferHandCount,
  getBufferWorkerFPS,
  setBufferWorkerFPS,
  // View accessors
  getFaceLandmarkViews,
  getBlendshapeViews,
  getTransformationMatrixViews,
  getHandLandmarkViews,
  getWorldLandmarkViews,
  getHandMetadataViews,
  // Support check
  isSharedArrayBufferSupported,
  getSharedArrayBufferStatus,
} from './shared/detectionBuffer'

export {
  // Constants
  BLENDSHAPE_NAMES,
  GESTURE_NAMES,
  HANDEDNESS,
  // Reconstruction functions
  reconstructFaceLandmarkerResult,
  reconstructGestureRecognizerResult,
  reconstructDetectionResults,
  // Utilities
  hasDetectionData,
  getDetectionCounts,
} from './shared/detectionReconstruct'

export {
  writeFaceResult,
  writeGestureResult,
  writeDetectionResults,
  clearDetectionBuffer,
} from './shared/detectionWrite'

// Re-export from shared/index.ts for convenience
export * from './shared'

// ============================================================================
// Vocabulary
// ============================================================================

export {
  mediapipeKeywords,
} from './vocabulary/keywords'

export {
  detectionKeywords,
} from './vocabulary/detectionKeywords'

export {
  type HandSpatialInfo,
  type SpatialUpdateMessage,
  type Category,
  type ModelPaths,
  type DisplayContext,
  type FaceLandmarkerConfig,
  type GestureRecognizerConfig,
} from './vocabulary/detectionSchemas'

export {
  type MediaPipeCommand,
  type MediaPipeEvent,
} from './vocabulary/schemas'

// ============================================================================
// Task Infrastructure
// ============================================================================

export {
  type RenderContext,
  type RenderTask,
} from './tasks/types'

export {
  mapLandmarkToViewport,
  transformLandmarksToViewport,
  rescaleLandmark,
  rescaleFaceResult,
  rescaleGestureResult,
} from './tasks/utils'

// ============================================================================
// Types
// ============================================================================

export type {
  Matrix,
} from './types'

export {
  systemTasks,
} from './worker/kernel/systemTasks'

// ============================================================================
// System Configuration
// ============================================================================

export {
  mediapipeSystemConfig,
  mediapipeManager,
  useMediapipeSystem,
  useMediapipeResource,
  useMediapipeStatus,
  MediapipeSystemProvider,
  type MediapipeSystem,
} from './system'

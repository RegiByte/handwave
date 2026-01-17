/**
 * SharedArrayBuffer Detection Module
 *
 * Zero-copy shared memory for MediaPipe detection results.
 *
 * Usage:
 * - Main thread: createDetectionSharedBuffer(), reconstructDetectionResults()
 * - Worker: createDetectionBufferViews(), writeDetectionResults()
 */

// Buffer layout and creation
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
} from './detectionBuffer'

// Reconstruction (main thread reads)
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
} from './detectionReconstruct'

// Writing (worker writes)
export {
  writeFaceResult,
  writeGestureResult,
  writeDetectionResults,
  clearDetectionBuffer,
} from './detectionWrite'


/**
 * Detection Result Writing
 *
 * Worker-side functions for writing MediaPipe detection results to SharedArrayBuffer.
 * Writes to the inactive buffer, then swaps to make data visible.
 *
 * Philosophy: Write is a transformation from objects to numbers.
 * The inverse of reconstruction.
 */

import type {
  FaceLandmarkerResult,
  GestureRecognizerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision'

import {
  BLENDSHAPES_COUNT,
  FACE_LANDMARKS_COUNT,
  HAND_LANDMARKS_COUNT,
  LANDMARK_COMPONENTS,
  MAX_FACES,
  MAX_HANDS,
  WORLD_LANDMARK_COMPONENTS,
  getBlendshapeViews,
  getFaceLandmarkViews,
  getHandLandmarkViews,
  getHandMetadataViews,
  getInactiveBufferIndex,
  getTransformationMatrixViews,
  getWorldLandmarkViews,
  setBufferFaceCount,
  setBufferHandCount,
  setBufferTimestamp,
  setBufferWorkerFPS,
  swapDetectionBuffers,
} from './detectionBuffer'
import type { DetectionBufferViews } from './detectionBuffer'

import { GESTURE_NAMES, HANDEDNESS } from './detectionReconstruct'
import type { Matrix } from '@/core/lib/mediapipe/types'

// ============================================================================
// Landmark Writing
// ============================================================================

/**
 * Write a single landmark to the buffer.
 */
function writeLandmark(
  view: Float32Array,
  index: number,
  landmark: NormalizedLandmark,
  hasVisibility: boolean,
): void {
  const components = hasVisibility
    ? LANDMARK_COMPONENTS
    : WORLD_LANDMARK_COMPONENTS
  const offset = index * components

  view[offset] = landmark.x
  view[offset + 1] = landmark.y
  view[offset + 2] = landmark.z

  if (hasVisibility) {
    view[offset + 3] = landmark.visibility ?? 0
  }
}

/**
 * Write an array of landmarks to the buffer.
 */
function writeLandmarks(
  view: Float32Array,
  landmarks: Array<NormalizedLandmark>,
  expectedCount: number,
  hasVisibility: boolean,
): void {
  const count = Math.min(landmarks.length, expectedCount)
  for (let i = 0; i < count; i++) {
    writeLandmark(view, i, landmarks[i], hasVisibility)
  }

  // Zero out remaining slots if fewer landmarks than expected
  if (count < expectedCount) {
    const components = hasVisibility
      ? LANDMARK_COMPONENTS
      : WORLD_LANDMARK_COMPONENTS
    const startOffset = count * components
    const endOffset = expectedCount * components
    view.fill(0, startOffset, endOffset)
  }
}

/**
 * Write blendshapes to the buffer.
 * Only writes scores - names are reconstructed from constants.
 */
function writeBlendshapes(
  view: Float32Array,
  categories: Array<{ score: number }> | undefined,
): void {
  if (!categories) {
    view.fill(0)
    return
  }

  const count = Math.min(categories.length, BLENDSHAPES_COUNT)
  for (let i = 0; i < count; i++) {
    view[i] = categories[i].score
  }

  // Zero out remaining if fewer blendshapes
  if (count < BLENDSHAPES_COUNT) {
    view.fill(0, count)
  }
}

/**
 * Write transformation matrix to the buffer.
 */
function writeTransformationMatrix(
  view: Float32Array,
  matrix: Matrix | undefined,
): void {
  if (!matrix?.data) {
    view.fill(0)
    return
  }

  const count = Math.min(matrix.data.length, 16)
  for (let i = 0; i < count; i++) {
    view[i] = matrix.data[i]
  }

  if (count < 16) {
    view.fill(0, count)
  }
}

// ============================================================================
// Face Result Writing
// ============================================================================

/**
 * Write FaceLandmarkerResult to the inactive buffer.
 */
export function writeFaceResult(
  views: DetectionBufferViews,
  result: FaceLandmarkerResult | null,
): void {
  const bufferIdx = getInactiveBufferIndex(views)

  if (!result || result.faceLandmarks.length === 0) {
    setBufferFaceCount(views, bufferIdx, 0)
    return
  }

  const faceCount = Math.min(result.faceLandmarks.length, MAX_FACES)
  setBufferFaceCount(views, bufferIdx, faceCount)

  const faceLandmarkViews = getFaceLandmarkViews(views, bufferIdx)
  const blendshapeViews = getBlendshapeViews(views, bufferIdx)
  const transformViews = getTransformationMatrixViews(views, bufferIdx)

  for (let i = 0; i < faceCount; i++) {
    // Write landmarks
    writeLandmarks(
      faceLandmarkViews[i],
      result.faceLandmarks[i],
      FACE_LANDMARKS_COUNT,
      true,
    )

    // Write blendshapes
    writeBlendshapes(
      blendshapeViews[i],
      result.faceBlendshapes?.[i]?.categories,
    )

    // Write transformation matrix
    writeTransformationMatrix(
      transformViews[i],
      result.facialTransformationMatrixes?.[i],
    )
  }

  // Zero out unused face slots
  for (let i = faceCount; i < MAX_FACES; i++) {
    faceLandmarkViews[i].fill(0)
    blendshapeViews[i].fill(0)
    transformViews[i].fill(0)
  }
}

// ============================================================================
// Gesture Result Writing
// ============================================================================

/**
 * Get handedness value from category name.
 */
function getHandednessValue(categoryName: string): number {
  const name = categoryName.toLowerCase()
  if (name === 'left') return HANDEDNESS.LEFT
  if (name === 'right') return HANDEDNESS.RIGHT
  return HANDEDNESS.UNKNOWN
}

/**
 * Get gesture index from category name.
 */
function getGestureIndex(categoryName: string): number {
  const index = GESTURE_NAMES.indexOf(categoryName)
  return index >= 0 ? index : 0 // Default to 'None' if not found
}

/**
 * Write GestureRecognizerResult to the inactive buffer.
 */
export function writeGestureResult(
  views: DetectionBufferViews,
  result: GestureRecognizerResult | null,
): void {
  const bufferIdx = getInactiveBufferIndex(views)

  if (!result || result.landmarks.length === 0) {
    setBufferHandCount(views, bufferIdx, 0)
    return
  }

  const handCount = Math.min(result.landmarks.length, MAX_HANDS)
  setBufferHandCount(views, bufferIdx, handCount)

  const handLandmarkViews = getHandLandmarkViews(views, bufferIdx)
  const worldLandmarkViews = getWorldLandmarkViews(views, bufferIdx)
  const handMetadataViews = getHandMetadataViews(views, bufferIdx)

  for (let i = 0; i < handCount; i++) {
    // Write landmarks
    writeLandmarks(
      handLandmarkViews[i],
      result.landmarks[i],
      HAND_LANDMARKS_COUNT,
      true,
    )

    // Write world landmarks
    if (result.worldLandmarks?.[i]) {
      writeLandmarks(
        worldLandmarkViews[i],
        result.worldLandmarks[i],
        HAND_LANDMARKS_COUNT,
        false,
      )
    } else {
      worldLandmarkViews[i].fill(0)
    }

    // Write hand metadata
    // Layout: handedness(1) + padding(3) + handednessScore(4) + gestureIndex(1) + padding(3) + gestureScore(4)
    const metadata = handMetadataViews[i]

    // Handedness
    const handednessCategory = result.handedness?.[i]?.[0]
    metadata[0] = handednessCategory
      ? getHandednessValue(handednessCategory.categoryName)
      : HANDEDNESS.UNKNOWN

    // Padding bytes 1-3
    metadata[1] = 0
    metadata[2] = 0
    metadata[3] = 0

    // Handedness score (Float32 at offset 4)
    const handednessScoreView = new Float32Array(
      metadata.buffer,
      metadata.byteOffset + 4,
      1,
    )
    handednessScoreView[0] = handednessCategory?.score ?? 0

    // Gesture index
    const gestureCategory = result.gestures?.[i]?.[0]
    metadata[8] = gestureCategory
      ? getGestureIndex(gestureCategory.categoryName)
      : 0

    // Padding bytes 9-11
    metadata[9] = 0
    metadata[10] = 0
    metadata[11] = 0

    // Gesture score (Float32 at offset 12)
    const gestureScoreView = new Float32Array(
      metadata.buffer,
      metadata.byteOffset + 12,
      1,
    )
    gestureScoreView[0] = gestureCategory?.score ?? 0
  }

  // Zero out unused hand slots
  for (let i = handCount; i < MAX_HANDS; i++) {
    handLandmarkViews[i].fill(0)
    worldLandmarkViews[i].fill(0)
    handMetadataViews[i].fill(0)
  }
}

// ============================================================================
// Combined Write Operation
// ============================================================================

/**
 * Write both face and gesture results to the inactive buffer,
 * set the timestamp, worker FPS, and swap buffers to make data visible.
 *
 * This is the main function the worker should call after detection.
 */
export function writeDetectionResults(
  views: DetectionBufferViews,
  faceResult: FaceLandmarkerResult | null,
  gestureResult: GestureRecognizerResult | null,
  timestamp: number,
  workerFPS?: number,
): void {
  const bufferIdx = getInactiveBufferIndex(views)

  // Write timestamp
  setBufferTimestamp(views, bufferIdx, timestamp)

  // Write worker FPS if provided
  if (workerFPS !== undefined) {
    setBufferWorkerFPS(views, bufferIdx, workerFPS)
  }

  // Write face result
  writeFaceResult(views, faceResult)

  // Write gesture result
  writeGestureResult(views, gestureResult)

  // Swap buffers to make new data visible to main thread
  swapDetectionBuffers(views)
}

// ============================================================================
// Clear Buffer
// ============================================================================

/**
 * Clear all detection data in the inactive buffer.
 * Useful for resetting state.
 */
export function clearDetectionBuffer(views: DetectionBufferViews): void {
  const bufferIdx = getInactiveBufferIndex(views)

  setBufferTimestamp(views, bufferIdx, 0)
  setBufferFaceCount(views, bufferIdx, 0)
  setBufferHandCount(views, bufferIdx, 0)

  // Zero out all data views
  const faceLandmarkViews = getFaceLandmarkViews(views, bufferIdx)
  const blendshapeViews = getBlendshapeViews(views, bufferIdx)
  const transformViews = getTransformationMatrixViews(views, bufferIdx)
  const handLandmarkViews = getHandLandmarkViews(views, bufferIdx)
  const worldLandmarkViews = getWorldLandmarkViews(views, bufferIdx)
  const handMetadataViews = getHandMetadataViews(views, bufferIdx)

  for (let i = 0; i < MAX_FACES; i++) {
    faceLandmarkViews[i].fill(0)
    blendshapeViews[i].fill(0)
    transformViews[i].fill(0)
  }

  for (let i = 0; i < MAX_HANDS; i++) {
    handLandmarkViews[i].fill(0)
    worldLandmarkViews[i].fill(0)
    handMetadataViews[i].fill(0)
  }

  swapDetectionBuffers(views)
}

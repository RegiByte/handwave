/**
 * Detection Result Reconstruction
 *
 * Transforms raw SharedArrayBuffer data back into canonical detection types.
 * The buffer stores only numeric data - we reconstruct the full objects here.
 *
 * Philosophy: Separation of storage (numbers) and meaning (objects).
 * Names and structure are constant - only values change.
 */

import type {
  RawDetectionFrame,
  RawHandDetection,
  RawFaceDetection,
  Landmark,
  Category,
} from '@handwave/intent-engine'

import type { DetectionBufferViews } from './detectionBuffer'
import {
  BLENDSHAPES_COUNT,
  FACE_LANDMARKS_COUNT,
  HAND_LANDMARKS_COUNT,
  LANDMARK_COMPONENTS,
  WORLD_LANDMARK_COMPONENTS,
  getActiveBufferIndex,
  getBlendshapeViews,
  getBufferFaceCount,
  getBufferHandCount,
  getBufferTimestamp,
  getBufferWorkerFPS,
  getFaceLandmarkViews,
  getHandLandmarkViews,
  getHandMetadataViews,
  getTransformationMatrixViews,
  getWorldLandmarkViews,
} from './detectionBuffer'

// ============================================================================
// Blendshape Names (ARKit Compatible)
// ============================================================================

/**
 * The 52 face blendshape names in MediaPipe order.
 * These are constant - we only store scores in the buffer.
 */
export const BLENDSHAPE_NAMES: ReadonlyArray<string> = [
  '_neutral',
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
] as const

// ============================================================================
// Gesture Names
// ============================================================================

/**
 * Gesture category names in MediaPipe order.
 * Index 0 = None, then the recognized gestures.
 */
export const GESTURE_NAMES: ReadonlyArray<string> = [
  'None',
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Down',
  'Thumb_Up',
  'Victory',
  'ILoveYou',
] as const

// ============================================================================
// Handedness Values
// ============================================================================

/** Handedness encoding in the buffer */
export const HANDEDNESS = {
  UNKNOWN: 0,
  LEFT: 1,
  RIGHT: 2,
} as const

/** Map handedness byte to string */
const HANDEDNESS_NAMES: Record<number, string> = {
  [HANDEDNESS.UNKNOWN]: 'Unknown',
  [HANDEDNESS.LEFT]: 'Left',
  [HANDEDNESS.RIGHT]: 'Right',
}

// ============================================================================
// Reconstruction Functions
// ============================================================================

/**
 * Reconstruct a single landmark from buffer data.
 */
function reconstructLandmark(
  view: Float32Array,
  index: number,
  hasVisibility: boolean,
): Landmark {
  const components = hasVisibility
    ? LANDMARK_COMPONENTS
    : WORLD_LANDMARK_COMPONENTS
  const offset = index * components

  const landmark: Landmark = {
    x: view[offset],
    y: view[offset + 1],
    z: view[offset + 2],
  }

  if (hasVisibility) {
    landmark.visibility = view[offset + 3]
  }

  return landmark
}

/**
 * Reconstruct an array of landmarks from buffer data.
 */
function reconstructLandmarks(
  view: Float32Array,
  count: number,
  hasVisibility: boolean,
): Array<Landmark> {
  const landmarks: Array<Landmark> = []
  for (let i = 0; i < count; i++) {
    landmarks.push(reconstructLandmark(view, i, hasVisibility))
  }
  return landmarks
}

/**
 * Reconstruct blendshape categories from buffer data.
 */
function reconstructBlendshapes(view: Float32Array): Array<Category> {
  const categories: Array<Category> = []
  for (let i = 0; i < BLENDSHAPES_COUNT; i++) {
    categories.push({
      name: BLENDSHAPE_NAMES[i],
      score: view[i],
      index: i,
    })
  }
  return categories
}

/**
 * Reconstruct canonical face detections from the active buffer.
 * Returns empty array if no faces detected.
 */
export function reconstructFaceDetections(
  views: DetectionBufferViews,
): RawFaceDetection[] {
  const activeIdx = getActiveBufferIndex(views)
  const faceCount = getBufferFaceCount(views, activeIdx)

  if (faceCount === 0) {
    return []
  }

  const faceLandmarkViews = getFaceLandmarkViews(views, activeIdx)
  const blendshapeViews = getBlendshapeViews(views, activeIdx)
  const transformViews = getTransformationMatrixViews(views, activeIdx)

  const faces: RawFaceDetection[] = []

  for (let i = 0; i < faceCount; i++) {
    // Reconstruct landmarks
    const landmarks = reconstructLandmarks(
      faceLandmarkViews[i],
      FACE_LANDMARKS_COUNT,
      true,
    )

    // Reconstruct blendshapes
    const blendshapes = reconstructBlendshapes(blendshapeViews[i])

    // Reconstruct transformation matrix
    const transformationMatrix = {
      rows: 4 as const,
      columns: 4 as const,
      data: Array.from(transformViews[i]),
    }

    faces.push({
      landmarks,
      blendshapes,
      transformationMatrix,
    })
  }

  return faces
}

/**
 * Reconstruct canonical hand detections from the active buffer.
 * Returns empty array if no hands detected.
 */
export function reconstructHandDetections(
  views: DetectionBufferViews,
): RawHandDetection[] {
  const activeIdx = getActiveBufferIndex(views)
  const handCount = getBufferHandCount(views, activeIdx)

  if (handCount === 0) {
    return []
  }

  const handLandmarkViews = getHandLandmarkViews(views, activeIdx)
  const worldLandmarkViews = getWorldLandmarkViews(views, activeIdx)
  const handMetadataViews = getHandMetadataViews(views, activeIdx)

  const hands: RawHandDetection[] = []

  for (let i = 0; i < handCount; i++) {
    // Reconstruct landmarks
    const landmarks = reconstructLandmarks(
      handLandmarkViews[i],
      HAND_LANDMARKS_COUNT,
      true,
    )

    // Reconstruct world landmarks
    const worldLandmarks = reconstructLandmarks(
      worldLandmarkViews[i],
      HAND_LANDMARKS_COUNT,
      false,
    )

    // Reconstruct handedness from metadata
    // Layout: handedness(1) + padding(3) + handednessScore(4) + gestureIndex(1) + padding(3) + gestureScore(4)
    const metadata = handMetadataViews[i]
    const handednessValue = metadata[0]
    const handednessScoreView = new Float32Array(
      metadata.buffer,
      metadata.byteOffset + 4,
      1,
    )
    const gestureIndex = metadata[8]
    const gestureScoreView = new Float32Array(
      metadata.buffer,
      metadata.byteOffset + 12,
      1,
    )

    // Get handedness name (normalized to lowercase)
    const handednessName = HANDEDNESS_NAMES[handednessValue] || 'Unknown'
    const handedness = handednessName.toLowerCase() as
      | 'left'
      | 'right'
      | 'unknown'

    // Get gesture name
    const gesture = GESTURE_NAMES[gestureIndex] || 'None'

    hands.push({
      handedness,
      handednessScore: handednessScoreView[0],
      gesture,
      gestureScore: gestureScoreView[0],
      landmarks,
      worldLandmarks,
    })
  }

  return hands
}

/**
 * Reconstruct canonical detection frame from the active buffer.
 * Main function for reading detection data from SharedArrayBuffer.
 */
export function reconstructDetectionFrame(
  views: DetectionBufferViews,
): RawDetectionFrame {
  const activeIdx = getActiveBufferIndex(views)
  const timestamp = getBufferTimestamp(views, activeIdx)

  // Reconstruct hands and faces
  const hands = reconstructHandDetections(views)
  const faces = reconstructFaceDetections(views)

  // Build canonical frame
  const frame: RawDetectionFrame = {
    timestamp,
    detectors: {},
  }

  // Add hands if present
  if (hands.length > 0) {
    frame.detectors.hand = hands
  }

  // Add faces if present
  if (faces.length > 0) {
    frame.detectors.face = faces
  }

  return frame
}

/**
 * Get worker FPS from the active buffer.
 */
export function getWorkerFPS(views: DetectionBufferViews): number {
  const activeIdx = getActiveBufferIndex(views)
  return getBufferWorkerFPS(views, activeIdx)
}

// ============================================================================
// Utility: Check if buffer has data
// ============================================================================

/**
 * Check if the active buffer has any detection data.
 */
export function hasDetectionData(views: DetectionBufferViews): boolean {
  const activeIdx = getActiveBufferIndex(views)
  const faceCount = getBufferFaceCount(views, activeIdx)
  const handCount = getBufferHandCount(views, activeIdx)
  return faceCount > 0 || handCount > 0
}

/**
 * Get detection counts from the active buffer.
 */
export function getDetectionCounts(views: DetectionBufferViews): {
  faceCount: number
  handCount: number
} {
  const activeIdx = getActiveBufferIndex(views)
  return {
    faceCount: getBufferFaceCount(views, activeIdx),
    handCount: getBufferHandCount(views, activeIdx),
  }
}

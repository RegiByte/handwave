/**
 * Detection Result Reconstruction
 *
 * Transforms raw SharedArrayBuffer data back into MediaPipe-compatible objects.
 * The buffer stores only numeric data - we reconstruct the full objects here.
 *
 * Philosophy: Separation of storage (numbers) and meaning (objects).
 * Names and structure are constant - only values change.
 */

import type {
  Category,
  FaceLandmarkerResult,
  GestureRecognizerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision'

import type { Matrix } from '../types'
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
): NormalizedLandmark {
  const components = hasVisibility
    ? LANDMARK_COMPONENTS
    : WORLD_LANDMARK_COMPONENTS
  const offset = index * components

  const landmark: NormalizedLandmark = {
    x: view[offset],
    y: view[offset + 1],
    z: view[offset + 2],
    visibility: hasVisibility ? view[offset + 3] : 0,
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
): Array<NormalizedLandmark> {
  const landmarks: Array<NormalizedLandmark> = []
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
      categoryName: BLENDSHAPE_NAMES[i],
      displayName: BLENDSHAPE_NAMES[i],
      score: view[i],
      index: i,
    })
  }
  return categories
}

/**
 * Reconstruct FaceLandmarkerResult from the active buffer.
 * Returns null if no faces detected.
 */
export function reconstructFaceLandmarkerResult(
  views: DetectionBufferViews,
): FaceLandmarkerResult | null {
  const activeIdx = getActiveBufferIndex(views)
  const faceCount = getBufferFaceCount(views, activeIdx)

  if (faceCount === 0) {
    return null
  }

  const faceLandmarkViews = getFaceLandmarkViews(views, activeIdx)
  const blendshapeViews = getBlendshapeViews(views, activeIdx)
  const transformViews = getTransformationMatrixViews(views, activeIdx)

  const faceLandmarks: Array<Array<NormalizedLandmark>> = []
  const faceBlendshapes: Array<{
    headIndex: number
    headName: string
    categories: Array<Category>
  }> = []
  const facialTransformationMatrixes: Array<Matrix> = []

  for (let i = 0; i < faceCount; i++) {
    // Reconstruct landmarks
    faceLandmarks.push(
      reconstructLandmarks(faceLandmarkViews[i], FACE_LANDMARKS_COUNT, true),
    )

    // Reconstruct blendshapes (Classifications type requires headIndex and headName)
    faceBlendshapes.push({
      headIndex: i,
      headName: `face_${i}`,
      categories: reconstructBlendshapes(blendshapeViews[i]),
    })

    // Copy transformation matrix (create new Float32Array to avoid shared reference)
    // Matrix type requires rows, columns, and data
    facialTransformationMatrixes.push({
      rows: 4,
      columns: 4,
      data: transformViews[i],
    } as unknown as Matrix)
  }

  // Cast through unknown to satisfy TypeScript - MediaPipe types are strict
  // but our reconstruction matches the runtime structure
  return {
    faceLandmarks,
    faceBlendshapes,
    facialTransformationMatrixes,
  } as FaceLandmarkerResult
}

/**
 * Reconstruct GestureRecognizerResult from the active buffer.
 * Returns null if no hands detected.
 */
export function reconstructGestureRecognizerResult(
  views: DetectionBufferViews,
): GestureRecognizerResult | null {
  const activeIdx = getActiveBufferIndex(views)
  const handCount = getBufferHandCount(views, activeIdx)

  if (handCount === 0) {
    return null
  }

  const handLandmarkViews = getHandLandmarkViews(views, activeIdx)
  const worldLandmarkViews = getWorldLandmarkViews(views, activeIdx)
  const handMetadataViews = getHandMetadataViews(views, activeIdx)

  const landmarks: Array<Array<NormalizedLandmark>> = []
  const worldLandmarks: Array<Array<NormalizedLandmark>> = []
  const handednesses: Array<{
    headIndex: number
    headName: string
    categories: Array<Category>
  }> = []
  const gestures: Array<{
    headIndex: number
    headName: string
    categories: Array<Category>
  }> = []

  for (let i = 0; i < handCount; i++) {
    // Reconstruct landmarks
    landmarks.push(
      reconstructLandmarks(handLandmarkViews[i], HAND_LANDMARKS_COUNT, true),
    )

    // Reconstruct world landmarks
    worldLandmarks.push(
      reconstructLandmarks(worldLandmarkViews[i], HAND_LANDMARKS_COUNT, false),
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

    // Handedness (Classifications type requires headIndex and headName)
    handednesses.push({
      headIndex: i,
      headName: `hand_${i}`,
      categories: [
        {
          categoryName: HANDEDNESS_NAMES[handednessValue] || 'Unknown',
          displayName: HANDEDNESS_NAMES[handednessValue] || 'Unknown',
          score: handednessScoreView[0],
          index: handednessValue,
        },
      ],
    })

    // Gesture (Classifications type requires headIndex and headName)
    gestures.push({
      headIndex: i,
      headName: `gesture_${i}`,
      categories: [
        {
          categoryName: GESTURE_NAMES[gestureIndex] || 'None',
          displayName: GESTURE_NAMES[gestureIndex] || 'None',
          score: gestureScoreView[0],
          index: gestureIndex,
        },
      ],
    })
  }

  // Cast through unknown to satisfy TypeScript - MediaPipe types are strict
  // but our reconstruction matches the runtime structure
  // Note: MediaPipe uses both 'handedness' and 'handednesses' in different versions
  return {
    landmarks,
    worldLandmarks,
    handedness: handednesses, // Legacy property name
    handednesses, // New property name
    gestures,
  } as unknown as GestureRecognizerResult
}

/**
 * Reconstruct both face and gesture results from the active buffer.
 * Convenience function for getting all detection results at once.
 */
export function reconstructDetectionResults(views: DetectionBufferViews): {
  faceResult: FaceLandmarkerResult | null
  gestureResult: GestureRecognizerResult | null
  timestamp: number
  workerFPS: number
} {
  const activeIdx = getActiveBufferIndex(views)

  return {
    faceResult: reconstructFaceLandmarkerResult(views),
    gestureResult: reconstructGestureRecognizerResult(views),
    timestamp: getBufferTimestamp(views, activeIdx),
    workerFPS: getBufferWorkerFPS(views, activeIdx),
  }
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

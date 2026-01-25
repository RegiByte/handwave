/**
 * MediaPipe Adapter
 *
 * Transforms MediaPipe native types to canonical detection types.
 * This is the adapter boundary - MediaPipe types stay here, canonical types flow out.
 *
 * Philosophy: Clean separation between detection backend and public API.
 * All MediaPipe-specific logic contained in this module.
 */

import type {
  GestureRecognizerResult,
  FaceLandmarkerResult,
  NormalizedLandmark,
  Category as MediaPipeCategory,
} from '@mediapipe/tasks-vision'
import type {
  RawHandDetection,
  RawFaceDetection,
  RawDetectionFrame,
  Landmark,
  Category,
} from '@handwave/intent-engine'

// ============================================================================
// Landmark Transformation
// ============================================================================

/**
 * Transform MediaPipe NormalizedLandmark to canonical Landmark
 */
function transformLandmark(mp: NormalizedLandmark): Landmark {
  return {
    x: mp.x,
    y: mp.y,
    z: mp.z,
    visibility: mp.visibility,
  }
}

/**
 * Transform array of MediaPipe landmarks to canonical landmarks
 */
function transformLandmarks(
  mpLandmarks: NormalizedLandmark[],
): Landmark[] {
  return mpLandmarks.map(transformLandmark)
}

/**
 * Transform MediaPipe Category to canonical Category
 */
function transformCategory(mp: MediaPipeCategory): Category {
  return {
    name: mp.categoryName,
    score: mp.score,
    index: mp.index,
  }
}

// ============================================================================
// Hand Detection Transformation
// ============================================================================

/**
 * Transform a single hand detection from MediaPipe GestureRecognizerResult
 * to canonical RawHandDetection.
 *
 * Handles MediaPipe's nested structure where gestures and handedness are
 * actually Detection[] with nested categories, not Category[][] as typed.
 *
 * @param gestureResult - MediaPipe gesture recognizer result
 * @param handIndex - Index of the hand to transform (0-3)
 * @returns Canonical hand detection or null if invalid
 */
export function transformHandDetection(
  gestureResult: GestureRecognizerResult,
  handIndex: number,
): RawHandDetection | null {
  // Validate hand index
  if (handIndex < 0 || handIndex >= gestureResult.landmarks.length) {
    return null
  }

  // Extract landmarks
  const landmarks = gestureResult.landmarks[handIndex]
  const worldLandmarks = gestureResult.worldLandmarks?.[handIndex]

  if (!landmarks || landmarks.length !== 21) {
    return null
  }

  if (!worldLandmarks || worldLandmarks.length !== 21) {
    return null
  }

  // Extract handedness
  // MediaPipe returns handedness as Category[][] (array of arrays)
  // handedness[handIndex] is an array of Category objects
  const handednessCategories = (gestureResult.handedness as any)?.[handIndex]
  const handednessCategory = handednessCategories?.[0]

  const handednessName = handednessCategory?.categoryName || 'Unknown'
  const handednessScore = handednessCategory?.score ?? 0

  // Normalize handedness to lowercase for canonical format
  const handedness = handednessName.toLowerCase() as 'left' | 'right' | 'unknown'

  // Extract gesture
  // MediaPipe returns gestures as Category[][] (array of arrays)
  // gestures[handIndex] is an array of Category objects
  const gestureCategories = (gestureResult.gestures as any)?.[handIndex]
  const gestureCategory = gestureCategories?.[0]

  const gestureName = gestureCategory?.categoryName || 'None'
  const gestureScore = gestureCategory?.score ?? 0

  // Build canonical hand detection
  return {
    handedness,
    handednessScore,
    gesture: gestureName,
    gestureScore,
    landmarks: transformLandmarks(landmarks),
    worldLandmarks: transformLandmarks(worldLandmarks),
  }
}

/**
 * Transform all hands from MediaPipe GestureRecognizerResult
 * to canonical RawHandDetection array.
 *
 * @param gestureResult - MediaPipe gesture recognizer result
 * @returns Array of canonical hand detections
 */
export function transformAllHands(
  gestureResult: GestureRecognizerResult | null,
): RawHandDetection[] {
  if (!gestureResult || !gestureResult.landmarks.length) {
    return []
  }

  const hands: RawHandDetection[] = []

  for (let i = 0; i < gestureResult.landmarks.length; i++) {
    const hand = transformHandDetection(gestureResult, i)
    if (hand) {
      hands.push(hand)
    }
  }

  return hands
}

// ============================================================================
// Face Detection Transformation
// ============================================================================

/**
 * Transform a single face detection from MediaPipe FaceLandmarkerResult
 * to canonical RawFaceDetection.
 *
 * @param faceResult - MediaPipe face landmarker result
 * @param faceIndex - Index of the face to transform (0-1)
 * @returns Canonical face detection or null if invalid
 */
export function transformFaceDetection(
  faceResult: FaceLandmarkerResult,
  faceIndex: number,
): RawFaceDetection | null {
  // Validate face index
  if (faceIndex < 0 || faceIndex >= faceResult.faceLandmarks.length) {
    return null
  }

  // Extract landmarks
  const landmarks = faceResult.faceLandmarks[faceIndex]

  if (!landmarks || landmarks.length === 0) {
    return null
  }

  // Extract blendshapes (optional)
  const blendshapesObj = faceResult.faceBlendshapes?.[faceIndex]
  const blendshapes = blendshapesObj?.categories
    ? blendshapesObj.categories.map(transformCategory)
    : undefined

  // Extract transformation matrix (optional)
  const matrixObj = faceResult.facialTransformationMatrixes?.[faceIndex]
  const transformationMatrix = matrixObj
    ? {
      rows: 4 as const,
      columns: 4 as const,
      data: Array.from(matrixObj.data),
    }
    : undefined

  // Build canonical face detection
  return {
    landmarks: transformLandmarks(landmarks),
    blendshapes,
    transformationMatrix,
  }
}

/**
 * Transform all faces from MediaPipe FaceLandmarkerResult
 * to canonical RawFaceDetection array.
 *
 * @param faceResult - MediaPipe face landmarker result
 * @returns Array of canonical face detections
 */
export function transformAllFaces(
  faceResult: FaceLandmarkerResult | null,
): RawFaceDetection[] {
  if (!faceResult || !faceResult.faceLandmarks.length) {
    return []
  }

  const faces: RawFaceDetection[] = []

  for (let i = 0; i < faceResult.faceLandmarks.length; i++) {
    const face = transformFaceDetection(faceResult, i)
    if (face) {
      faces.push(face)
    }
  }

  return faces
}

// ============================================================================
// Frame Transformation
// ============================================================================

/**
 * Transform MediaPipe detection results to canonical RawDetectionFrame.
 *
 * This is the main adapter function that converts MediaPipe's native types
 * to the canonical detection format used throughout the system.
 *
 * @param gestureResult - MediaPipe gesture recognizer result (hands)
 * @param faceResult - MediaPipe face landmarker result (faces)
 * @param timestamp - Frame timestamp in milliseconds
 * @returns Canonical detection frame
 */
export function transformToRawFrame(
  gestureResult: GestureRecognizerResult | null,
  faceResult: FaceLandmarkerResult | null,
  timestamp: number,
): RawDetectionFrame {
  // Transform hands
  const hands = transformAllHands(gestureResult)

  // Transform faces
  const faces = transformAllFaces(faceResult)

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


/** A connection between two landmarks. */
export declare interface Connection {
  start: number;
  end: number;
}

/** Converts a list of connection in array notation to a list of Connections. */
export function convertToConnections(...connections: Array<[number, number]>):
  Connection[] {
  return connections.map(([start, end]) => ({ start, end }));
}

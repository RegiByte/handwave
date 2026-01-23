import type {
  FaceLandmarkerResult,
  GestureRecognizerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision'

/**
 * Map normalized landmark coordinates (0-1) to viewport canvas coordinates
 */
export const mapLandmarkToViewport = (
  landmark: { x: number; y: number; z?: number; visibility?: number },
  viewport: { x: number; y: number; width: number; height: number },
  mirrored: boolean,
): { x: number; y: number; z?: number; visibility?: number } => {
  let x = landmark.x * viewport.width + viewport.x
  const y = landmark.y * viewport.height + viewport.y

  if (mirrored) {
    // Mirror within viewport
    x = viewport.x + viewport.width - (x - viewport.x)
  }

  return { x, y, z: landmark.z, visibility: landmark.visibility }
}

/**
 * Transform an array of landmarks to viewport coordinates
 * Returns normalized coordinates (0-1) relative to the full canvas
 */
export const transformLandmarksToViewport = (
  landmarks: Array<{ x: number; y: number; z?: number; visibility?: number }>,
  viewport: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  mirrored: boolean,
): Array<{ x: number; y: number; z: number; visibility: number }> => {
  return landmarks.map((landmark) => {
    const mapped = mapLandmarkToViewport(landmark, viewport, mirrored)
    // Convert back to normalized coordinates for DrawingUtils
    return {
      x: mapped.x / canvasWidth,
      y: mapped.y / canvasHeight,
      z: landmark.z ?? 0,
      visibility: landmark.visibility ?? 1,
    }
  })
}

/**
 * Rescale a normalized landmark from one viewport to another
 * 
 * NOTE: This is NOT needed for viewport changes during pause!
 * MediaPipe landmarks are normalized (0-1) relative to video dimensions,
 * and render tasks transform them using the CURRENT viewport.
 * So landmarks automatically map correctly when viewport changes.
 * 
 * This function is kept for potential future use cases where
 * landmarks need to be transformed between different coordinate spaces.
 */
export function rescaleLandmark(
  landmark: NormalizedLandmark,
  fromViewport: { x: number; y: number; width: number; height: number },
  toViewport: { x: number; y: number; width: number; height: number },
): NormalizedLandmark {
  // Convert from normalized to absolute pixels in old viewport
  const oldX = fromViewport.x + landmark.x * fromViewport.width
  const oldY = fromViewport.y + landmark.y * fromViewport.height

  // Convert back to normalized in new viewport
  const newX = (oldX - toViewport.x) / toViewport.width
  const newY = (oldY - toViewport.y) / toViewport.height

  return {
    x: newX,
    y: newY,
    z: landmark.z, // Z is already normalized, no need to rescale
    visibility: landmark.visibility,
  }
}

/**
 * Rescale face landmarks when viewport changes during pause
 */
export function rescaleFaceResult(
  result: FaceLandmarkerResult,
  fromViewport: { x: number; y: number; width: number; height: number },
  toViewport: { x: number; y: number; width: number; height: number },
): FaceLandmarkerResult {
  return {
    ...result,
    faceLandmarks: result.faceLandmarks.map((face) =>
      face.map((landmark) => rescaleLandmark(landmark, fromViewport, toViewport)),
    ),
  }
}

/**
 * Rescale gesture/hand landmarks when viewport changes during pause
 */
export function rescaleGestureResult(
  result: GestureRecognizerResult,
  fromViewport: { x: number; y: number; width: number; height: number },
  toViewport: { x: number; y: number; width: number; height: number },
): GestureRecognizerResult {
  return {
    ...result,
    landmarks: result.landmarks.map((hand) =>
      hand.map((landmark) => rescaleLandmark(landmark, fromViewport, toViewport)),
    ),
    worldLandmarks: result.worldLandmarks, // World landmarks are in 3D space, don't rescale
  }
}


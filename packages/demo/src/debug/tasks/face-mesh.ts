import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { transformLandmarksToViewport } from '@handwave/mediapipe'
import type { RenderTask } from '@handwave/mediapipe'

/**
 * Extract face oval landmark indices from MediaPipe connections
 */
export function getFaceOvalIndices(): Array<number> {
  const indices = new Set<number>()
  for (const connection of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
    indices.add(connection.start)
    indices.add(connection.end)
  }
  return Array.from(indices).sort((a, b) => a - b)
}

/**
 * Render task: Draw face mesh tesselation
 * Respects the mirrored state for selfie mode and viewport
 * Renders every frame
 */
export const faceMeshTask: RenderTask = ({
  drawer,
  detectionFrame,
  mirrored,
  viewport,
  width,
  height,
}) => {
  const faces = detectionFrame?.detectors?.face
  if (!faces || faces.length === 0) return

  for (const face of faces) {
    const landmarks = face.landmarks
    // Transform landmarks to viewport coordinates
    const transformedLandmarks = transformLandmarksToViewport(
      landmarks,
      viewport,
      width,
      height,
      mirrored,
    )

    drawer.drawConnectors(
      transformedLandmarks,
      FaceLandmarker.FACE_LANDMARKS_CONTOURS,
      {
        color: 'rgba(0, 255, 255, 0.2)',
        lineWidth: 4,
      },
    )
    drawer.drawConnectors(
      transformedLandmarks,
      FaceLandmarker.FACE_LANDMARKS_TESSELATION,
      {
        color: 'rgba(255, 255, 255, 0.2)',
        lineWidth: 0.5,
      },
    )
    drawer.drawConnectors(
      transformedLandmarks,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      {
        color: 'rgba(255, 255, 255, 0.8)',
        lineWidth: 2,
      },
    )
    drawer.drawConnectors(
      transformedLandmarks,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      {
        color: 'rgba(255, 255, 255, 0.8)',
        lineWidth: 2,
      },
    )
    drawer.drawConnectors(
      transformedLandmarks,
      FaceLandmarker.FACE_LANDMARKS_LIPS,
      {
        color: 'rgba(255, 255, 255, 0.8)',
        lineWidth: 2,
      },
    )

    drawer.drawConnectors(
      transformedLandmarks,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
      {
        color: 'rgba(255, 255, 255, 0.8)',
        lineWidth: 2,
      },
    )
    drawer.drawConnectors(
      transformedLandmarks,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
      {
        color: 'rgba(255, 255, 255, 0.8)',
        lineWidth: 2,
      },
    )
    drawer.drawConnectors(
      transformedLandmarks,
      FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
      {
        color: 'rgba(0, 255, 255, 0.8)',
        lineWidth: 1,
      },
    )
    drawer.drawConnectors(
      transformedLandmarks,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
      {
        color: 'rgba(0, 255, 255, 0.8)',
        lineWidth: 1,
      },
    )
  }
}


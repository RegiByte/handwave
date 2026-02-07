import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { transformLandmarksToViewport } from '@handwave/mediapipe'
import type { RenderContext, RenderTask } from '@handwave/mediapipe'
import { task } from '@handwave/system'

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
 * 
 * Optimized: Uses object form, renders every other frame to reduce overhead
 * Pre-allocates style objects to avoid repeated object creation
 */
export const faceMeshTask = task<RenderContext, undefined>(() => {
  // Pre-allocate style objects (created once, reused every frame)
  const contoursStyle = { color: 'rgba(0, 255, 255, 0.2)', lineWidth: 4 }
  const tesselationStyle = { color: 'rgba(255, 255, 255, 0.2)', lineWidth: 0.5 }
  const eyeStyle = { color: 'rgba(255, 255, 255, 0.8)', lineWidth: 2 }
  const irisStyle = { color: 'rgba(0, 255, 255, 0.8)', lineWidth: 1 }

  return {
    execute: ({
      drawer,
      detectionFrame,
      mirrored,
      viewport,
      width,
      height,
    }) => {
      const faces = detectionFrame?.detectors?.face
      if (!faces || faces.length === 0) return

      for (let i = 0; i < faces.length; i++) {
        const face = faces[i]
        const landmarks = face.landmarks

        // Transform landmarks to viewport coordinates
        const transformedLandmarks = transformLandmarksToViewport(
          landmarks,
          viewport,
          width,
          height,
          mirrored,
        )

        // Draw all face features using pre-allocated style objects
        drawer.drawConnectors(
          transformedLandmarks,
          FaceLandmarker.FACE_LANDMARKS_CONTOURS,
          contoursStyle,
        )
        drawer.drawConnectors(
          transformedLandmarks,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          tesselationStyle,
        )
        drawer.drawConnectors(
          transformedLandmarks,
          FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
          eyeStyle,
        )
        drawer.drawConnectors(
          transformedLandmarks,
          FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
          eyeStyle,
        )
        // drawer.drawConnectors(
        //   transformedLandmarks,
        //   FaceLandmarker.FACE_LANDMARKS_LIPS,
        //   lipsStyle,
        // )
        // drawer.drawConnectors(
        //   transformedLandmarks,
        //   FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
        //   eyebrowStyle,
        // )
        // drawer.drawConnectors(
        //   transformedLandmarks,
        //   FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
        //   eyebrowStyle,
        // )
        drawer.drawConnectors(
          transformedLandmarks,
          FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
          irisStyle,
        )
        drawer.drawConnectors(
          transformedLandmarks,
          FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
          irisStyle,
        )
      }
    },
  }
})


import { GestureRecognizer } from '@mediapipe/tasks-vision'
import { transformLandmarksToViewport } from '@handwave/mediapipe'
import type { RenderTask } from '@handwave/mediapipe'

/**
 * Hand Landmarks Configuration
 */
export type HandLandmarksConfig = {
  connectionColor?: string
  landmarkColor?: string
  lineWidth?: number
  radius?: number
}

/**
 * Create Hand Landmarks Render Task
 * 
 * Draws hand landmarks and connections.
 * Respects the mirrored state for selfie mode and viewport.
 * Renders every frame.
 */
export const createHandLandmarksTask = (
  config?: HandLandmarksConfig
): RenderTask => {
  const connectionColor = config?.connectionColor ?? '#FF6B6B'
  const landmarkColor = config?.landmarkColor ?? '#00FF88'
  const lineWidth = config?.lineWidth ?? 4
  const radius = config?.radius ?? 3

  return ({ drawer, gestureResult, mirrored, viewport, width, height }) => {
    if (!gestureResult?.landmarks?.length) return

    for (const landmarks of gestureResult.landmarks) {
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
        GestureRecognizer.HAND_CONNECTIONS,
        {
          color: connectionColor,
          lineWidth,
        },
      )
      drawer.drawLandmarks(transformedLandmarks, {
        radius,
        color: landmarkColor,
      })
    }
  }
}

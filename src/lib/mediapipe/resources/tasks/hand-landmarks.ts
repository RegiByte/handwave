import { GestureRecognizer } from '@mediapipe/tasks-vision'
import { transformLandmarksToViewport } from './utils'
import type { RenderTask } from './types'

/**
 * Render task: Draw hand landmarks and connections
 * Respects the mirrored state for selfie mode and viewport
 * Renders every frame
 */
export const handLandmarksTask: RenderTask = ({
  drawer,
  gestureResult,
  mirrored,
  viewport,
  width,
  height,
}) => {
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
        color: '#FF6B6B',
        lineWidth: 4,
      },
    )
    drawer.drawLandmarks(transformedLandmarks, {
      radius: 3,
      color: '#00FF88',
    })
  }
}

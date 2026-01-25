import { transformLandmarksToViewport } from '@handwave/mediapipe'
import type { RenderTask } from '@handwave/mediapipe'
import { convertToConnections } from '@handwave/mediapipe';

// MediaPipe hand connections (21-point hand model)
const HAND_CONNECTIONS = convertToConnections(
  [0, 1], [1, 2], [2, 3], [3, 4],  // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],  // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],  // Ring
  [0, 17], [17, 18], [18, 19], [19, 20],  // Pinky
  [5, 9], [9, 13], [13, 17],  // Palm
)



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

  return ({ drawer, detectionFrame, mirrored, viewport, width, height }) => {
    const hands = detectionFrame?.detectors?.hand
    if (!hands || hands.length === 0) return

    for (const hand of hands) {
      // Transform landmarks to viewport coordinates
      const transformedLandmarks = transformLandmarksToViewport(
        hand.landmarks,
        viewport,
        width,
        height,
        mirrored,
      )

      drawer.drawConnectors(
        transformedLandmarks,
        HAND_CONNECTIONS,
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

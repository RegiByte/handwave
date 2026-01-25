import { transformLandmarksToViewport } from '@handwave/mediapipe'
import type { RenderTask } from '@handwave/mediapipe'

/**
 * Custom hand connection patterns
 * Hand landmarks: 0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
 */
type RenderableConnection = {
  start: number
  end: number
  minDistance?: number
}

// Default hand skeleton connections
const DEFAULT_HAND_CONNECTIONS: Array<RenderableConnection> = [
  { start: 0, end: 1 },
  { start: 0, end: 5 },
  { start: 0, end: 9 },
  { start: 0, end: 13 },
  { start: 0, end: 17 },
  { start: 5, end: 9 },
  { start: 9, end: 13 },
  { start: 13, end: 17 },
  // Thumb
  { start: 1, end: 2 },
  { start: 2, end: 3 },
  { start: 3, end: 4 },
  // Index finger
  { start: 5, end: 6 },
  { start: 6, end: 7 },
  { start: 7, end: 8 },
  // Middle finger
  { start: 9, end: 10 },
  { start: 10, end: 11 },
  { start: 11, end: 12 },
  { start: 12, end: 4, minDistance: 0.2 },
  // Ring finger
  { start: 13, end: 14 },
  { start: 14, end: 15 },
  { start: 15, end: 16 },
  { start: 16, end: 4, minDistance: 0.2 },
  // Pinky finger
  { start: 17, end: 18 },
  { start: 18, end: 19 },
  { start: 19, end: 20 },
  { start: 20, end: 4, minDistance: 0.2 },
]

/**
 * Hand Custom Connections Configuration
 */
export type HandCustomConnectionsConfig = {
  connections?: Array<RenderableConnection>
  colorScale?: (value: number) => string
  lineWidth?: number
  showDistanceColors?: boolean
}

// Simple color scale from green to red based on distance
const defaultColorScale = (distance: number): string => {
  const hue = Math.max(0, Math.min(120, 120 * (1 - distance / 0.3)))
  return `hsl(${hue}, 70%, 50%)`
}

// Simple remap function
const remap = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number => {
  return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin
}

/**
 * Create Hand Custom Connections Render Task
 * 
 * Draws custom hand connections with distance-based coloring.
 * Useful for visualizing hand poses and finger interactions.
 */
export const createHandCustomConnectionsTask = (
  config?: HandCustomConnectionsConfig
): RenderTask => {
  const connections = config?.connections ?? DEFAULT_HAND_CONNECTIONS
  const colorScale = config?.colorScale ?? defaultColorScale
  const baseLineWidth = config?.lineWidth ?? 3
  const showDistanceColors = config?.showDistanceColors ?? true

  return ({ drawer, detectionFrame, mirrored, viewport, width, height }) => {
    const hands = detectionFrame?.detectors?.hand
    if (!hands || hands.length === 0) return

    for (const hand of hands) {
      const landmarks = hand.landmarks
      const transformed = transformLandmarksToViewport(
        landmarks,
        viewport,
        width,
        height,
        mirrored,
      )

      // Draw each connection
      connections.forEach(({ start, end, minDistance }) => {
        const startLandmark = landmarks[start]
        const endLandmark = landmarks[end]

        if (!startLandmark || !endLandmark) return

        // Calculate 3D distance
        const dx = endLandmark.x - startLandmark.x
        const dy = endLandmark.y - startLandmark.y
        const dz = (endLandmark.z ?? 0) - (startLandmark.z ?? 0)
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

        // Skip if distance threshold not met
        if (minDistance && distance > minDistance) return

        // Calculate line width based on distance (closer = thicker)
        const lineWidth = minDistance
          ? remap(distance, 0, minDistance, baseLineWidth * 1.5, baseLineWidth * 0.5)
          : baseLineWidth

        // Calculate color based on distance
        const color = showDistanceColors ? colorScale(distance) : '#FF6B6B'

        // Draw the connection
        drawer.drawConnectors(
          transformed,
          [{ start, end }],
          {
            color,
            lineWidth,
          },
        )
      })

      // Draw landmarks
      drawer.drawLandmarks(transformed, {
        radius: 3,
        color: '#00FF88',
      })
    }
  }
}

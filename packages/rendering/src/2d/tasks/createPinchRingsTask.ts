import { FINGERTIP_INDICES, calculateDistance3D } from '@handwave/intent-engine'
import type { Vector3 } from '@handwave/intent-engine'
import type { RenderTask } from '@handwave/mediapipe'
import { mapLandmarkToViewport } from '@handwave/mediapipe'

/**
 * Pinch Rings Configuration
 */
export type PinchRingsConfig = {
  threshold?: number
  ringRadius?: number
  color?: string
  glowRadius?: number
  lineWidth?: number
}

/**
 * Create Pinch Rings Render Task
 *
 * Highlights fingertips with colored rings when they are close enough to the thumb
 * to detect a pinch gesture. Ring intensity fades based on distance.
 *
 * Philosophy: Visual feedback makes invisible interactions visible.
 */
export const createPinchRingsTask = (
  config?: PinchRingsConfig
): RenderTask => {
  const threshold = config?.threshold ?? 0.07
  const ringRadius = config?.ringRadius ?? 18
  const color = config?.color ?? '0, 255, 136' // RGB for #00FF88
  const glowRadius = config?.glowRadius ?? 22
  const lineWidth = config?.lineWidth ?? 4

  return ({ ctx, detectionFrame, viewport, mirrored }) => {
    const hands = detectionFrame?.detectors?.hand
    if (!hands || hands.length === 0) return

    hands.forEach((hand) => {
      const landmarks = hand.landmarks

      // Get thumb tip (landmark 4)
      const thumbTip = landmarks[4]
      if (!thumbTip) return

      const thumbPos: Vector3 = {
        x: thumbTip.x,
        y: thumbTip.y,
        z: thumbTip.z ?? 0,
      }

      // Check each finger (index, middle, ring, pinky)
      const fingers = ['index', 'middle', 'ring', 'pinky'] as const

      fingers.forEach((finger) => {
        const tipIndex = FINGERTIP_INDICES[finger]
        const fingertip = landmarks[tipIndex]

        if (!fingertip) return

        const fingertipPos: Vector3 = {
          x: fingertip.x,
          y: fingertip.y,
          z: fingertip.z ?? 0,
        }

        // Calculate 3D distance between thumb and fingertip
        const distance = calculateDistance3D(thumbPos, fingertipPos)

        // Only draw ring if within threshold
        if (distance < threshold) {
          // Transform fingertip to viewport coordinates
          const mapped = mapLandmarkToViewport(fingertip, viewport, mirrored)

          // Calculate intensity (1.0 at distance 0, 0.0 at threshold)
          const intensity = Math.max(0, 1 - distance / threshold)

          // Draw outer glow ring (semi-transparent)
          ctx.strokeStyle = `rgba(${color}, ${intensity * 0.3})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(mapped.x, mapped.y, glowRadius, 0, Math.PI * 2)
          ctx.stroke()

          // Draw main ring (bright and prominent)
          ctx.strokeStyle = `rgba(${color}, ${intensity})`
          ctx.lineWidth = lineWidth
          ctx.beginPath()
          ctx.arc(mapped.x, mapped.y, ringRadius, 0, Math.PI * 2)
          ctx.stroke()

          // Draw inner filled circle for extra visibility
          ctx.fillStyle = `rgba(${color}, ${intensity * 0.2})`
          ctx.beginPath()
          ctx.arc(mapped.x, mapped.y, ringRadius - 4, 0, Math.PI * 2)
          ctx.fill()
        }
      })
    })
  }
}

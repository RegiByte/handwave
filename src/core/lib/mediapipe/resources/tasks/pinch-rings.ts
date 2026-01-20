/**
 * Pinch Rings Render Task
 *
 * Highlights fingertips with colored rings when they are close enough to the thumb
 * to detect a pinch gesture. Ring intensity fades based on distance.
 *
 * Philosophy: Visual feedback makes invisible interactions visible.
 */

import type { RenderTask } from './types'
import { mapLandmarkToViewport } from './utils'
import type { FrameHistoryAPI } from '@/core/lib/intent/resources/frameHistoryResource'
import {
  FINGERTIP_INDICES,
  calculateDistance3D,
} from '@/core/lib/intent/matching/contactDetector'
import type { Vector3 } from '@/core/lib/intent/core/types'

/**
 * Create pinch rings render task
 *
 * Draws colored rings around fingertips when they are close to the thumb (pinch detected).
 * Ring intensity fades based on distance from threshold.
 */
export const createPinchRingsTask = (
  _frameHistory: FrameHistoryAPI
): RenderTask => {
  return ({ ctx, gestureResult, viewport, mirrored }) => {
    if (!gestureResult?.landmarks?.length) return

    const PINCH_THRESHOLD = 0.07
    const RING_RADIUS = 18 // Larger and more prominent
    const RING_LINE_WIDTH = 4
    const GLOW_RADIUS = 22 // Outer glow ring

    gestureResult.landmarks.forEach((landmarks) => {
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
        if (distance < PINCH_THRESHOLD) {
          // Transform fingertip to viewport coordinates
          const mapped = mapLandmarkToViewport(fingertip, viewport, mirrored)

          // Calculate intensity (1.0 at distance 0, 0.0 at threshold)
          const intensity = Math.max(0, 1 - distance / PINCH_THRESHOLD)

          // Draw outer glow ring (semi-transparent)
          ctx.strokeStyle = `rgba(0, 255, 136, ${intensity * 0.3})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(mapped.x, mapped.y, GLOW_RADIUS, 0, Math.PI * 2)
          ctx.stroke()

          // Draw main ring (bright and prominent)
          ctx.strokeStyle = `rgba(0, 255, 136, ${intensity})`
          ctx.lineWidth = RING_LINE_WIDTH
          ctx.beginPath()
          ctx.arc(mapped.x, mapped.y, RING_RADIUS, 0, Math.PI * 2)
          ctx.stroke()

          // Draw inner filled circle for extra visibility
          ctx.fillStyle = `rgba(0, 255, 136, ${intensity * 0.2})`
          ctx.beginPath()
          ctx.arc(mapped.x, mapped.y, RING_RADIUS - 4, 0, Math.PI * 2)
          ctx.fill()
        }
      })
    })
  }
}

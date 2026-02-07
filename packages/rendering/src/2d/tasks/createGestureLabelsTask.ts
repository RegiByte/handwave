import type { RenderContext } from '@handwave/mediapipe'
import { task } from '@handwave/system';

/**
 * Gesture Labels Configuration
 */
export type GestureLabelsConfig = {
  position?: { x: number; y: number }
  fontSize?: number
  showConfidence?: boolean
  showHandedness?: boolean
}

/**
 * Create Gesture Labels Render Task
 * 
 * Shows gesture labels with handedness.
 * Labels are always drawn in screen space (not mirrored).
 * Supports multiple hands with handedness (Left/Right) and headIndex.
 */
export const createGestureLabelsTask = (
  config?: GestureLabelsConfig
) => task<RenderContext, undefined>(() => {
  const position = config?.position ?? { x: 10, y: 30 }
  const fontSize = config?.fontSize ?? 18
  const showConfidence = config?.showConfidence ?? true
  const showHandedness = config?.showHandedness ?? true

  return {
    execute: ({ ctx, detectionFrame }) => {
      const hands = detectionFrame?.detectors?.hand
      if (!hands || hands.length === 0) return

      ctx.font = `bold ${fontSize}px monospace`
      ctx.shadowColor = 'rgba(0,0,0,0.8)'
      ctx.shadowBlur = 4

      // Render each detected hand
      hands.forEach((hand, i) => {
        const gestureName = hand.gesture || 'None'
        const gestureScore = hand.gestureScore ?? 0
        const handLabel = hand.handedness || 'Unknown'

        // Color code by handedness: cyan for Right, magenta for Left
        if (showHandedness) {
          if (handLabel === 'right') {
            ctx.fillStyle = '#00ffff'
          } else if (handLabel === 'left') {
            ctx.fillStyle = '#ff00ff'
          } else {
            ctx.fillStyle = '#ffffff'
          }
        } else {
          ctx.fillStyle = '#ffffff'
        }

        // Format label
        let label = ''
        if (showHandedness) {
          const handPrefix = handLabel.charAt(0).toUpperCase()
          label += `[${handPrefix}] `
        }
        label += gestureName
        if (showConfidence) {
          label += ` (${(gestureScore * 100).toFixed(0)}%)`
        }
        label += ` #${hand.handIndex}`

        ctx.fillText(label, position.x, position.y + i * (fontSize + 12))
      })

      ctx.shadowBlur = 0
    }
  }
})
import { GESTURE_NAMES } from '@handwave/mediapipe'
import type { Category } from '@handwave/mediapipe'
import type { RenderTask } from '@handwave/mediapipe'

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
): RenderTask => {
  const position = config?.position ?? { x: 10, y: 30 }
  const fontSize = config?.fontSize ?? 18
  const showConfidence = config?.showConfidence ?? true
  const showHandedness = config?.showHandedness ?? true

  return ({ ctx, gestureResult }) => {
    if (!gestureResult?.gestures?.length) return

    ctx.font = `bold ${fontSize}px monospace`
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 4

    // Build a map of headIndex -> handedness info for quick lookup
    const handednessMap = new Map<number, { hand: string; score: number }>()
    if (gestureResult.handedness) {
      gestureResult.handedness.forEach((handedness: any) => {
        const headIndex = handedness.headIndex ?? 0
        const category = handedness.categories?.[0]
        if (category) {
          handednessMap.set(headIndex, {
            hand: category.categoryName || category.displayName || 'Unknown',
            score: category.score ?? 0,
          })
        }
      })
    }

    // Render each detected gesture
    gestureResult.gestures.forEach((gesture, i) => {
      if (gesture) {
        const gestureData = gesture as unknown as {
          headIndex?: number
          categories: Array<Category>
        }

        const headIndex = gestureData.headIndex ?? i
        const firstCategory = gestureData.categories[0] ?? { index: 0, score: 0 }
        const categoryIndex = firstCategory.index ?? 0
        const categoryScore = firstCategory.score ?? 0
        const gestureName = GESTURE_NAMES[categoryIndex] ?? GESTURE_NAMES[0]

        // Get handedness info
        const handInfo = handednessMap.get(headIndex)
        const handLabel = handInfo ? handInfo.hand : 'Unknown'

        // Color code by handedness: cyan for Right, magenta for Left
        if (showHandedness) {
          if (handLabel === 'Right') {
            ctx.fillStyle = '#00ffff'
          } else if (handLabel === 'Left') {
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
          label += ` (${(categoryScore * 100).toFixed(0)}%)`
        }
        label += ` #${headIndex}`

        ctx.fillText(label, position.x, position.y + i * (fontSize + 12))
      }
    })

    ctx.shadowBlur = 0
  }
}

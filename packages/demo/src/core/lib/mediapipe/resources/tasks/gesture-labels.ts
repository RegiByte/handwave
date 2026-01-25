import type { RenderTask } from './types'
import { GESTURE_NAMES, type Category } from '@handwave/mediapipe'

/**
 * Render task: Show gesture labels with handedness
 * Labels are always drawn in screen space (not mirrored)
 * Supports multiple hands with handedness (Left/Right) and headIndex
 */
export const gestureLabelsTask: RenderTask = ({ ctx, gestureResult }) => {
  if (!gestureResult?.gestures?.length) return

  ctx.font = 'bold 18px monospace'
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

  // Render each detected gesture with its handedness
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
      if (handLabel === 'Right') {
        ctx.fillStyle = '#00ffff' // cyan
      } else if (handLabel === 'Left') {
        ctx.fillStyle = '#ff00ff' // magenta
      } else {
        ctx.fillStyle = '#ffffff' // white for unknown
      }

      // Format: "[L/R] Gesture (confidence%) #headIndex"
      const handPrefix = handLabel.charAt(0).toUpperCase()
      const label = `[${handPrefix}] ${gestureName} (${(categoryScore * 100).toFixed(0)}%) #${headIndex}`

      ctx.fillText(label, 10, 30 + i * 30)
    }
  })

  ctx.shadowBlur = 0
}

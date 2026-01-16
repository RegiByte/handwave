import type { RenderTask } from './types'

/**
 * Render task: Show gesture labels
 * Labels are always drawn in screen space (not mirrored)
 */
export const gestureLabelsTask: RenderTask = ({ ctx, gestureResult }) => {
  if (!gestureResult?.gestures?.length) return

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.shadowColor = 'rgba(0,0,0,0.8)'
  ctx.shadowBlur = 4

  gestureResult.gestures.forEach((gestures, i) => {
    const top = gestures[0]
    if (top) {
      ctx.fillText(
        `${top.categoryName} (${(top.score * 100).toFixed(0)}%)`,
        10,
        30 + i * 24,
      )
    }
  })

  ctx.shadowBlur = 0
}

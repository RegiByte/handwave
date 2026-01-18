import type { RenderTask } from './types'
import type { LoopAPI } from '@/core/lib/mediapipe/resources/loop'

/**
 * Render task: Show pause indicator
 */
export const createPauseIndicatorTask = (
  loopState: LoopAPI['state'],
): RenderTask => {
  return ({ ctx, width, height }) => {
    if (!loopState.get().paused) return

    // Draw pause indicator in center
    ctx.fillStyle = 'rgba(255, 107, 107, 0.8)'
    ctx.font = 'bold 28px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 8

    ctx.fillText('⏸ PAUSED', width / 2, height * 0.2)

    ctx.shadowBlur = 0
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  }
}

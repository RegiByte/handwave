import type { LoopAPI } from '../loop'
import type { RenderTask } from './types'

/**
 * Render task: Show FPS counter
 */
export const createFpsTask = (loopState: LoopAPI['state']): RenderTask => {
  return ({ ctx, width }) => {
    const fps = loopState.get().fps
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(width - 70, 10, 60, 24)
    ctx.fillStyle = '#0f0'
    ctx.font = '14px monospace'
    ctx.fillText(`${fps} FPS`, width - 62, 27)
  }
}

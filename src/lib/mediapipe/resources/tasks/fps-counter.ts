import type { LoopAPI } from '../loop'
import type { RenderTask } from './types'

/**
 * Render task: Show FPS counter
 * Displays both render FPS (main thread) and worker FPS (detection thread)
 */
export const createFpsTask = (loopState: LoopAPI['state']): RenderTask => {
  return ({ ctx, width }) => {
    const { fps, workerFPS } = loopState.get()

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(width - 180, 10, 160, 50)

    // Render FPS (main thread)
    ctx.fillStyle = '#0f0'
    ctx.font = 'bold 14px monospace'
    ctx.fillText('Render:', width - 170, 27)
    ctx.fillText(`${fps} FPS`, width - 80, 27)

    // Worker FPS (detection thread)
    ctx.fillStyle = '#0ff'
    ctx.font = 'bold 14px monospace'

    ctx.fillText('Detection:', width - 170, 47)
    ctx.fillText(`${workerFPS} FPS`, width - 80, 47)
  }
}

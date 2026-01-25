import type { LoopResource } from '@handwave/mediapipe'
import type { RenderTask } from '@handwave/mediapipe'

/**
 * FPS Counter Configuration
 */
export type FpsConfig = {
  position?: { x: number; y: number }
  showWorkerFPS?: boolean
  fontSize?: number
}

/**
 * Create FPS Counter Render Task
 * 
 * Displays both render FPS (main thread) and worker FPS (detection thread).
 */
export const createFpsTask = (
  loopState: LoopResource['state'],
  config?: FpsConfig
): RenderTask => {
  const showWorkerFPS = config?.showWorkerFPS ?? true
  const fontSize = config?.fontSize ?? 14

  return ({ ctx, width }) => {
    const { fps, workerFPS } = loopState.get()

    // Calculate position
    const x = config?.position?.x ?? width - 180
    const y = config?.position?.y ?? 10

    // Background
    const panelHeight = showWorkerFPS ? 50 : 30
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(x, y, 160, panelHeight)

    // Render FPS (main thread)
    ctx.fillStyle = '#0f0'
    ctx.font = `bold ${fontSize}px monospace`
    ctx.fillText('Render:', x + 10, y + 17)
    ctx.fillText(`${fps} FPS`, x + 90, y + 17)

    // Worker FPS (detection thread) if enabled
    if (showWorkerFPS) {
      ctx.fillStyle = '#0ff'
      ctx.font = `bold ${fontSize}px monospace`
      ctx.fillText('Detection:', x + 10, y + 37)
      ctx.fillText(`${workerFPS} FPS`, x + 90, y + 37)
    }
  }
}

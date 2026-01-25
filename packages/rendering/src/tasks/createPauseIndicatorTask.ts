import type { LoopResource } from '@handwave/mediapipe'
import type { RenderTask } from '@handwave/mediapipe'

/**
 * Pause Indicator Configuration
 */
export type PauseConfig = {
  position?: 'center' | 'top' | 'bottom'
  text?: string
  fontSize?: number
}

/**
 * Create Pause Indicator Render Task
 * 
 * Shows pause indicator when the loop is paused.
 */
export const createPauseIndicatorTask = (
  loopState: LoopResource['state'],
  config?: PauseConfig
): RenderTask => {
  const position = config?.position ?? 'top'
  const text = config?.text ?? '⏸ PAUSED'
  const fontSize = config?.fontSize ?? 28

  return ({ ctx, width, height }) => {
    if (!loopState.get().paused) return

    // Calculate Y position based on config
    let y: number
    switch (position) {
      case 'center':
        y = height / 2
        break
      case 'bottom':
        y = height * 0.8
        break
      case 'top':
      default:
        y = height * 0.2
        break
    }

    // Draw pause indicator
    ctx.fillStyle = 'rgba(255, 107, 107, 0.8)'
    ctx.font = `bold ${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 8

    ctx.fillText(text, width / 2, y)

    ctx.shadowBlur = 0
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  }
}

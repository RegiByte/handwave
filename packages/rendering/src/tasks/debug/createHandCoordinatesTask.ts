import type { RenderTask } from '@handwave/mediapipe'

/**
 * Hand Coordinates Configuration
 */
export type HandCoordinatesConfig = {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  maxLandmarks?: number
  panelWidth?: number
}

/**
 * Create Hand Coordinates Render Task
 * 
 * Shows detailed 3D coordinates for hand landmarks.
 * Displays a panel with X, Y, Z coordinates for all detected hands.
 * Renders every frame.
 */
export const createHandCoordinatesTask = (
  config?: HandCoordinatesConfig
): RenderTask => {
  const position = config?.position ?? 'top-right'
  const maxLandmarks = config?.maxLandmarks ?? 10
  const panelWidth = config?.panelWidth ?? 300

  return ({ ctx, gestureResult, width, height }) => {
    if (!gestureResult?.landmarks?.length) return

    const lineHeight = 14

    gestureResult.landmarks.forEach((landmarks, handIndex) => {
      const panelHeight = Math.min(landmarks.length, maxLandmarks) * lineHeight + 30

      // Calculate panel position based on config
      let panelX: number
      let panelY: number

      switch (position) {
        case 'top-left':
          panelX = 10
          panelY = 60 + handIndex * (panelHeight + 10)
          break
        case 'bottom-right':
          panelX = width - panelWidth - 10
          panelY = height - panelHeight - 10 - handIndex * (panelHeight + 10)
          break
        case 'bottom-left':
          panelX = 10
          panelY = height - panelHeight - 10 - handIndex * (panelHeight + 10)
          break
        case 'top-right':
        default:
          panelX = width - panelWidth - 10
          panelY = 60 + handIndex * (panelHeight + 10)
          break
      }

      // Draw semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
      ctx.fillRect(panelX, panelY, panelWidth, panelHeight)

      // Draw title
      ctx.fillStyle = '#00FF88'
      ctx.font = 'bold 11px monospace'
      ctx.fillText(`Hand ${handIndex + 1} Landmarks`, panelX + 8, panelY + 14)

      // Draw first N landmarks (to save space)
      ctx.font = '9px monospace'
      landmarks.slice(0, maxLandmarks).forEach((landmark, i) => {
        const y = panelY + 28 + i * lineHeight

        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fillText(`${i}:`, panelX + 8, y)

        ctx.fillStyle = '#fff'
        const coordText = `X:${landmark.x.toFixed(3)} Y:${landmark.y.toFixed(3)} Z:${landmark.z.toFixed(3)}`
        ctx.fillText(coordText, panelX + 28, y)
      })
    })
  }
}

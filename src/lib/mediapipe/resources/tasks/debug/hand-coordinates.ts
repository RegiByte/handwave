import type { RenderTask } from '../types'

/**
 * Render task: Show detailed 3D coordinates for hand landmarks
 * Displays a panel with X, Y, Z coordinates for all detected hands
 * Renders every frame
 */
export const handCoordinatesTask: RenderTask = ({
  ctx,
  gestureResult,
  width,
}) => {
  if (!gestureResult?.landmarks?.length) return

  const panelWidth = 300
  const panelX = width - panelWidth - 10
  const panelY = 60
  const lineHeight = 14

  gestureResult.landmarks.forEach((landmarks, handIndex) => {
    const panelHeight = Math.min(landmarks.length, 10) * lineHeight + 30

    // Draw semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fillRect(
      panelX,
      panelY + handIndex * (panelHeight + 10),
      panelWidth,
      panelHeight,
    )

    // Draw title
    ctx.fillStyle = '#00FF88'
    ctx.font = 'bold 11px monospace'
    ctx.fillText(
      `Hand ${handIndex + 1} Landmarks`,
      panelX + 8,
      panelY + handIndex * (panelHeight + 10) + 14,
    )

    // Draw first 10 landmarks (to save space)
    ctx.font = '9px monospace'
    landmarks.slice(0, 10).forEach((landmark, i) => {
      const y = panelY + handIndex * (panelHeight + 10) + 28 + i * lineHeight

      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(`${i}:`, panelX + 8, y)

      ctx.fillStyle = '#fff'
      const coordText = `X:${landmark.x.toFixed(3)} Y:${landmark.y.toFixed(3)} Z:${landmark.z.toFixed(3)}`
      ctx.fillText(coordText, panelX + 28, y)
    })
  })
}


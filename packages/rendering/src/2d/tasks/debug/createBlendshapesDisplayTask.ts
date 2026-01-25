import type { RenderTask } from '@handwave/mediapipe'

/**
 * Blendshapes Display Configuration
 */
export type BlendshapesDisplayConfig = {
  position?: { x: number; y: number }
  maxVisible?: number
  panelWidth?: number
}

/**
 * Create Blendshapes Display Render Task
 * 
 * Shows all face blendshapes in a scrollable list.
 * Displays blendshape coefficients with bars.
 * Renders every frame.
 */
export const createBlendshapesDisplayTask = (
  config?: BlendshapesDisplayConfig
): RenderTask => {
  const position = config?.position ?? { x: 10, y: 100 }
  const maxVisible = config?.maxVisible ?? 20
  const panelWidth = config?.panelWidth ?? 280

  return ({ ctx, faceResult }) => {
    if (!faceResult?.faceBlendshapes?.length) return

    const blendshapes = faceResult.faceBlendshapes[0]?.categories ?? []
    if (!blendshapes.length) return

    const lineHeight = 16
    const barHeight = 12

    // Sort by score descending
    const sorted = [...blendshapes].sort((a, b) => b.score - a.score)
    const visible = sorted.slice(0, maxVisible)

    // Draw semi-transparent background
    const panelHeight = visible.length * lineHeight + 20
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fillRect(position.x, position.y, panelWidth, panelHeight)

    // Draw title
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`Face Blendshapes (Top ${maxVisible})`, position.x + 8, position.y + 14)

    // Draw blendshapes
    ctx.font = '10px monospace'
    visible.forEach((blendshape, i) => {
      const y = position.y + 30 + i * lineHeight
      const score = blendshape.score

      // Name
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillText(blendshape.categoryName.slice(0, 18), position.x + 8, y)

      // Bar background
      const barX = position.x + 150
      const barWidth = 100
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fillRect(barX, y - barHeight / 2, barWidth, barHeight)

      // Bar fill (color based on intensity)
      const fillWidth = score * barWidth
      const hue = 120 - score * 120 // Green to red
      ctx.fillStyle = `hsl(${hue}, 70%, 50%)`
      ctx.fillRect(barX, y - barHeight / 2, fillWidth, barHeight)

      // Score value
      ctx.fillStyle = '#fff'
      ctx.fillText((score * 100).toFixed(0), barX + barWidth + 8, y)
    })
  }
}

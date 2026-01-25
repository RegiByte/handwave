import type { RenderTask } from '../types'

/**
 * Render task: Show all face blendshapes in a scrollable list
 * Displays all 52 blendshape coefficients with bars
 * Renders every frame
 */
export const blendshapesDisplayTask: RenderTask = ({ ctx, faceResult }) => {
  if (!faceResult?.faceBlendshapes?.length) return

  const blendshapes = faceResult.faceBlendshapes[0]?.categories ?? []
  if (!blendshapes.length) return

  const panelWidth = 280
  const panelX = 10
  const panelY = 100
  const lineHeight = 16
  const barHeight = 12
  const maxVisible = 20 // Show top 20 most active

  // Sort by score descending
  const sorted = [...blendshapes].sort((a, b) => b.score - a.score)
  const visible = sorted.slice(0, maxVisible)

  // Draw semi-transparent background
  const panelHeight = visible.length * lineHeight + 20
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight)

  // Draw title
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 12px monospace'
  ctx.fillText('Face Blendshapes (Top 20)', panelX + 8, panelY + 14)

  // Draw blendshapes
  ctx.font = '10px monospace'
  visible.forEach((blendshape, i) => {
    const y = panelY + 30 + i * lineHeight
    const score = blendshape.score

    // Name
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText(blendshape.categoryName.slice(0, 18), panelX + 8, y)

    // Bar background
    const barX = panelX + 150
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


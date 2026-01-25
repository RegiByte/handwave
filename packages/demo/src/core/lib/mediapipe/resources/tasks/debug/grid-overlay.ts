import type { RenderTask } from '@/core/lib/mediapipe/resources/tasks/types'

/**
 * Render task: Grid Overlay
 * 
 * Displays a grid overlay on the viewport to visualize spatial cells.
 * Shows hand positions as dots on the grid.
 * 
 * Grid config is computed from viewport dimensions:
 * - Default: 12x8 grid (landscape) or 8x12 (portrait)
 * - Adjusts to maintain roughly square cells
 * - Dead zones: margins where hand detection is unreliable
 * 
 * Keyboard shortcut: 'g' to toggle
 */

// Dead zone configuration (percentage of viewport)
// These can be adjusted based on camera characteristics
const DEAD_ZONE = {
  top: 0.05,    // 5% top margin
  bottom: 0.15, // 15% bottom margin (larger due to typical camera angle)
  left: 0.05,   // 8% left margin
  right: 0.05,  // 8% right margin
}

export const gridOverlayTask: RenderTask = ({
  ctx,
  gestureResult,
  viewport,
  mirrored,
}) => {
  if (!viewport) return

  const { x, y, width, height } = viewport

  // Calculate dead zone dimensions
  const deadZoneTop = height * DEAD_ZONE.top
  const deadZoneBottom = height * DEAD_ZONE.bottom
  const deadZoneLeft = width * DEAD_ZONE.left
  const deadZoneRight = width * DEAD_ZONE.right

  // Calculate safe zone (active detection area)
  const safeZone = {
    x: x + deadZoneLeft,
    y: y + deadZoneTop,
    width: width - deadZoneLeft - deadZoneRight,
    height: height - deadZoneTop - deadZoneBottom,
  }

  // Compute grid configuration based on SAFE ZONE
  // Aim for roughly 12 columns in landscape, 8 in portrait
  const isLandscape = safeZone.width > safeZone.height
  const targetCols = isLandscape ? 12 : 8
  
  // Adjust to maintain aspect ratio
  const aspectRatio = safeZone.width / safeZone.height
  const cols = targetCols
  const rows = Math.round(targetCols / aspectRatio)

  const cellWidth = safeZone.width / cols
  const cellHeight = safeZone.height / rows

  ctx.save()

  // Draw dead zones (semi-transparent red overlay)
  ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'
  
  // Top dead zone
  ctx.fillRect(x, y, width, deadZoneTop)
  
  // Bottom dead zone
  ctx.fillRect(x, y + height - deadZoneBottom, width, deadZoneBottom)
  
  // Left dead zone
  ctx.fillRect(x, y + deadZoneTop, deadZoneLeft, height - deadZoneTop - deadZoneBottom)
  
  // Right dead zone
  ctx.fillRect(x + width - deadZoneRight, y + deadZoneTop, deadZoneRight, height - deadZoneTop - deadZoneBottom)

  // Draw dead zone borders (dashed red lines)
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 5])
  ctx.strokeRect(safeZone.x, safeZone.y, safeZone.width, safeZone.height)
  ctx.setLineDash([]) // Reset

  // Draw grid lines (only in safe zone)
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)'
  ctx.lineWidth = 1

  // Vertical lines
  for (let col = 0; col <= cols; col++) {
    const lineX = safeZone.x + col * cellWidth
    ctx.beginPath()
    ctx.moveTo(lineX, safeZone.y)
    ctx.lineTo(lineX, safeZone.y + safeZone.height)
    ctx.stroke()
  }

  // Horizontal lines
  for (let row = 0; row <= rows; row++) {
    const lineY = safeZone.y + row * cellHeight
    ctx.beginPath()
    ctx.moveTo(safeZone.x, lineY)
    ctx.lineTo(safeZone.x + safeZone.width, lineY)
    ctx.stroke()
  }

  // Draw cell coordinates at corners (for debugging)
  ctx.fillStyle = 'rgba(0, 255, 136, 0.5)'
  ctx.font = '10px monospace'
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellX = safeZone.x + col * cellWidth + 4
      const cellY = safeZone.y + row * cellHeight + 12
      ctx.fillText(`${col},${row}`, cellX, cellY)
    }
  }

  // Draw hand positions as dots
  if (gestureResult?.landmarks?.length) {
    gestureResult.landmarks.forEach((landmarks, handIndex) => {
      // Use index finger tip (landmark 8) as representative position
      const indexTip = landmarks[8]
      if (!indexTip) return

      // Handle mirroring: when mirrored, flip X coordinate
      const normalizedX = mirrored ? (1 - indexTip.x) : indexTip.x
      const normalizedY = indexTip.y

      // Convert normalized coordinates to viewport coordinates (for visual dot)
      const handX = x + normalizedX * width
      const handY = y + normalizedY * height

      // Convert to safe zone normalized coordinates (0-1 within safe zone)
      const safeNormalizedX = (normalizedX - DEAD_ZONE.left) / (1 - DEAD_ZONE.left - DEAD_ZONE.right)
      const safeNormalizedY = (normalizedY - DEAD_ZONE.top) / (1 - DEAD_ZONE.top - DEAD_ZONE.bottom)

      // Check if hand is in safe zone
      const isInSafeZone = 
        safeNormalizedX >= 0 && safeNormalizedX <= 1 &&
        safeNormalizedY >= 0 && safeNormalizedY <= 1

      // Calculate which cell the hand is in (clamped to safe zone)
      const handCol = Math.max(0, Math.min(cols - 1, Math.floor(safeNormalizedX * cols)))
      const handRow = Math.max(0, Math.min(rows - 1, Math.floor(safeNormalizedY * rows)))

      // Calculate cell center
      const cellCenterX = safeZone.x + (handCol + 0.5) * cellWidth
      const cellCenterY = safeZone.y + (handRow + 0.5) * cellHeight

      // Calculate distance from hand to cell center (normalized within safe zone)
      const dx = safeNormalizedX - (handCol + 0.5) / cols
      const dy = safeNormalizedY - (handRow + 0.5) / rows
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Draw line from hand to cell center
      const lineColor = handIndex === 0 ? 'rgba(0, 255, 136, 0.8)' : 'rgba(255, 136, 0, 0.8)'
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5]) // Dashed line
      ctx.beginPath()
      ctx.moveTo(handX, handY)
      ctx.lineTo(cellCenterX, cellCenterY)
      ctx.stroke()
      ctx.setLineDash([]) // Reset to solid line

      // Draw dot at cell center
      ctx.fillStyle = handIndex === 0 ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 136, 0, 0.5)'
      ctx.beginPath()
      ctx.arc(cellCenterX, cellCenterY, 4, 0, Math.PI * 2)
      ctx.fill()

      // Draw dot at hand position (color indicates if in safe zone)
      if (isInSafeZone) {
        ctx.fillStyle = handIndex === 0 ? '#00FF88' : '#FF8800'
      } else {
        // Red/orange for hands in dead zone
        ctx.fillStyle = handIndex === 0 ? '#FF4444' : '#FF8844'
      }
      ctx.beginPath()
      ctx.arc(handX, handY, 8, 0, Math.PI * 2)
      ctx.fill()

      // Draw warning ring for hands in dead zone
      if (!isInSafeZone) {
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(handX, handY, 12, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Draw cell highlight (only if in safe zone)
      if (isInSafeZone) {
        ctx.strokeStyle = handIndex === 0 ? 'rgba(0, 255, 136, 0.6)' : 'rgba(255, 136, 0, 0.6)'
        ctx.lineWidth = 2
        ctx.strokeRect(
          safeZone.x + handCol * cellWidth,
          safeZone.y + handRow * cellHeight,
          cellWidth,
          cellHeight
        )
      }

      // Draw hand label with distance
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px sans-serif'
      const statusLabel = isInSafeZone ? '' : ' [DEAD ZONE]'
      ctx.fillText(
        `Hand ${handIndex + 1} [${handCol},${handRow}]${statusLabel}`,
        handX + 12,
        handY - 8
      )
      
      // Draw distance label (only if in safe zone)
      if (isInSafeZone) {
        ctx.font = '10px monospace'
        ctx.fillText(
          `d: ${distance.toFixed(3)}`,
          handX + 12,
          handY + 6
        )
      } else {
        // Warning for dead zone
        ctx.fillStyle = '#FF4444'
        ctx.font = 'bold 10px monospace'
        ctx.fillText(
          'UNRELIABLE',
          handX + 12,
          handY + 6
        )
      }
    })
  }

  // Draw grid info
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.fillRect(x + 10, y + 10, 220, 90)
  
  ctx.fillStyle = '#00FF88'
  ctx.font = 'bold 12px monospace'
  ctx.fillText('Grid Overlay', x + 18, y + 28)
  
  ctx.fillStyle = '#fff'
  ctx.font = '11px monospace'
  ctx.fillText(`Grid: ${cols}x${rows}`, x + 18, y + 44)
  ctx.fillText(`Cell: ${cellWidth.toFixed(0)}x${cellHeight.toFixed(0)}px`, x + 18, y + 58)
  
  // Dead zone info
  ctx.fillStyle = '#FF8888'
  ctx.font = 'bold 10px monospace'
  ctx.fillText('Dead Zones:', x + 18, y + 74)
  ctx.fillStyle = '#fff'
  ctx.font = '9px monospace'
  ctx.fillText(`T:${(DEAD_ZONE.top * 100).toFixed(0)}% B:${(DEAD_ZONE.bottom * 100).toFixed(0)}% L:${(DEAD_ZONE.left * 100).toFixed(0)}% R:${(DEAD_ZONE.right * 100).toFixed(0)}%`, x + 18, y + 88)

  ctx.restore()
}


import type { RenderTask } from '@handwave/mediapipe'

/**
 * Grid Overlay Configuration
 */
export type GridOverlayConfig = {
  deadZone?: { top: number; bottom: number; left: number; right: number }
  targetCols?: number
  showLabels?: boolean
  showHandPositions?: boolean
  showDeadZones?: boolean
  showInfo?: boolean
}

/**
 * Create Grid Overlay Render Task
 * 
 * Displays a grid overlay on the viewport to visualize spatial cells.
 * Shows hand positions as dots on the grid.
 * 
 * Grid config is computed from viewport dimensions:
 * - Default: 12x8 grid (landscape) or 8x12 (portrait)
 * - Adjusts to maintain roughly square cells
 * - Dead zones: margins where hand detection is unreliable
 */
export const createGridOverlayTask = (config?: GridOverlayConfig): RenderTask => {
  const deadZone = config?.deadZone ?? {
    top: 0.05,
    bottom: 0.15,
    left: 0.05,
    right: 0.05,
  }
  const targetCols = config?.targetCols ?? 12
  const showLabels = config?.showLabels ?? true
  const showHandPositions = config?.showHandPositions ?? true
  const showDeadZones = config?.showDeadZones ?? true
  const showInfo = config?.showInfo ?? true

  return ({ ctx, gestureResult, viewport, mirrored }) => {
    if (!viewport) return

    const { x, y, width, height } = viewport

    // Calculate dead zone dimensions
    const deadZoneTop = height * deadZone.top
    const deadZoneBottom = height * deadZone.bottom
    const deadZoneLeft = width * deadZone.left
    const deadZoneRight = width * deadZone.right

    // Calculate safe zone (active detection area)
    const safeZone = {
      x: x + deadZoneLeft,
      y: y + deadZoneTop,
      width: width - deadZoneLeft - deadZoneRight,
      height: height - deadZoneTop - deadZoneBottom,
    }

    // Compute grid configuration based on SAFE ZONE
    const isLandscape = safeZone.width > safeZone.height
    const cols = isLandscape ? targetCols : Math.round(targetCols * 2 / 3)
    
    // Adjust to maintain aspect ratio
    const aspectRatio = safeZone.width / safeZone.height
    const rows = Math.round(cols / aspectRatio)

    const cellWidth = safeZone.width / cols
    const cellHeight = safeZone.height / rows

    ctx.save()

    // Draw dead zones if enabled
    if (showDeadZones) {
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
      ctx.setLineDash([])
    }

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

    // Draw cell coordinates if enabled
    if (showLabels) {
      ctx.fillStyle = 'rgba(0, 255, 136, 0.5)'
      ctx.font = '10px monospace'
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cellX = safeZone.x + col * cellWidth + 4
          const cellY = safeZone.y + row * cellHeight + 12
          ctx.fillText(`${col},${row}`, cellX, cellY)
        }
      }
    }

    // Draw hand positions if enabled
    if (showHandPositions && gestureResult?.landmarks?.length) {
      gestureResult.landmarks.forEach((landmarks, handIndex) => {
        const indexTip = landmarks[8]
        if (!indexTip) return

        const normalizedX = mirrored ? (1 - indexTip.x) : indexTip.x
        const normalizedY = indexTip.y

        const handX = x + normalizedX * width
        const handY = y + normalizedY * height

        const safeNormalizedX = (normalizedX - deadZone.left) / (1 - deadZone.left - deadZone.right)
        const safeNormalizedY = (normalizedY - deadZone.top) / (1 - deadZone.top - deadZone.bottom)

        const isInSafeZone = 
          safeNormalizedX >= 0 && safeNormalizedX <= 1 &&
          safeNormalizedY >= 0 && safeNormalizedY <= 1

        const handCol = Math.max(0, Math.min(cols - 1, Math.floor(safeNormalizedX * cols)))
        const handRow = Math.max(0, Math.min(rows - 1, Math.floor(safeNormalizedY * rows)))

        const cellCenterX = safeZone.x + (handCol + 0.5) * cellWidth
        const cellCenterY = safeZone.y + (handRow + 0.5) * cellHeight

        const dx = safeNormalizedX - (handCol + 0.5) / cols
        const dy = safeNormalizedY - (handRow + 0.5) / rows
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Draw line from hand to cell center
        const lineColor = handIndex === 0 ? 'rgba(0, 255, 136, 0.8)' : 'rgba(255, 136, 0, 0.8)'
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(handX, handY)
        ctx.lineTo(cellCenterX, cellCenterY)
        ctx.stroke()
        ctx.setLineDash([])

        // Draw dot at cell center
        ctx.fillStyle = handIndex === 0 ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 136, 0, 0.5)'
        ctx.beginPath()
        ctx.arc(cellCenterX, cellCenterY, 4, 0, Math.PI * 2)
        ctx.fill()

        // Draw dot at hand position
        if (isInSafeZone) {
          ctx.fillStyle = handIndex === 0 ? '#00FF88' : '#FF8800'
        } else {
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

        // Draw cell highlight
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

        // Draw hand label
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 12px sans-serif'
        const statusLabel = isInSafeZone ? '' : ' [DEAD ZONE]'
        ctx.fillText(
          `Hand ${handIndex + 1} [${handCol},${handRow}]${statusLabel}`,
          handX + 12,
          handY - 8
        )
        
        if (isInSafeZone) {
          ctx.font = '10px monospace'
          ctx.fillText(`d: ${distance.toFixed(3)}`, handX + 12, handY + 6)
        } else {
          ctx.fillStyle = '#FF4444'
          ctx.font = 'bold 10px monospace'
          ctx.fillText('UNRELIABLE', handX + 12, handY + 6)
        }
      })
    }

    // Draw grid info if enabled
    if (showInfo) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
      ctx.fillRect(x + 10, y + 10, 220, 90)
      
      ctx.fillStyle = '#00FF88'
      ctx.font = 'bold 12px monospace'
      ctx.fillText('Grid Overlay', x + 18, y + 28)
      
      ctx.fillStyle = '#fff'
      ctx.font = '11px monospace'
      ctx.fillText(`Grid: ${cols}x${rows}`, x + 18, y + 44)
      ctx.fillText(`Cell: ${cellWidth.toFixed(0)}x${cellHeight.toFixed(0)}px`, x + 18, y + 58)
      
      ctx.fillStyle = '#FF8888'
      ctx.font = 'bold 10px monospace'
      ctx.fillText('Dead Zones:', x + 18, y + 74)
      ctx.fillStyle = '#fff'
      ctx.font = '9px monospace'
      ctx.fillText(`T:${(deadZone.top * 100).toFixed(0)}% B:${(deadZone.bottom * 100).toFixed(0)}% L:${(deadZone.left * 100).toFixed(0)}% R:${(deadZone.right * 100).toFixed(0)}%`, x + 18, y + 88)
    }

    ctx.restore()
  }
}

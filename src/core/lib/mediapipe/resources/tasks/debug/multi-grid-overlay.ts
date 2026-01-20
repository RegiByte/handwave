import type { GestureRecognizerResult } from '@mediapipe/tasks-vision'
import type { RenderTask } from '@/core/lib/mediapipe/resources/tasks/types'
import type { GridConfig, GridResolution } from '@/core/lib/intent/core/types'
import type { SpatialUpdateMessage } from '@/core/lib/mediapipe/vocabulary/detectionSchemas'
import { DEFAULT_GRID_PRESETS } from '@/core/lib/intent/spatial/grid'
import { intentKeywords } from '@/core/lib/intent/vocabulary/keywords'

/**
 * Render task: Multi-Resolution Grid Overlay
 *
 * Displays multiple grid resolutions simultaneously or individually.
 * Supports toggling between resolutions and showing all at once.
 *
 * Grid configurations:
 * - Coarse: 6x4 (big gestures, mode switching)
 * - Medium: 12x8 (standard interactions)
 * - Fine: 24x16 (precise work, drawing)
 *
 * Keyboard shortcuts:
 * - '1': Show coarse grid only
 * - '2': Show medium grid only
 * - '3': Show fine grid only
 * - '4': Show all grids simultaneously
 */

// Dead zone configuration (shared across all resolutions)
// Exported so runtime can sync to worker
export const DEAD_ZONE = {
  top: 0.05,
  bottom: 0.15,
  left: 0.05,
  right: 0.05,
} as const

// Grid visual configuration per resolution
const GRID_STYLES = {
  [intentKeywords.gridResolutions.coarse]: {
    color: 'rgba(239, 68, 68, 0.4)', // Red
    lineWidth: 2,
    labelSize: 12,
  },
  [intentKeywords.gridResolutions.medium]: {
    color: 'rgba(0, 201, 80.5, 0.3)', // Cyan (default)
    lineWidth: 1.5,
    labelSize: 10,
  },
  [intentKeywords.gridResolutions.fine]: {
    color: 'rgba(19.9, 71.2, 230, 0.25)', // Stone
    lineWidth: 1,
    labelSize: 8,
  },
}

export type MultiGridOverlayConfig = {
  activeResolution: GridResolution | 'all'
  showDeadZones: boolean
  showCellLabels: boolean
  showHandPositions: boolean
  spatialData?: () => SpatialUpdateMessage | null
}

export const createMultiGridOverlayTask = (
  config: MultiGridOverlayConfig,
): RenderTask => {
  return ({ ctx, gestureResult, viewport, mirrored }) => {
    if (!viewport) return

    const { x, y, width, height } = viewport

    // Calculate dead zones (shared)
    const deadZoneTop = height * DEAD_ZONE.top
    const deadZoneBottom = height * DEAD_ZONE.bottom
    const deadZoneLeft = width * DEAD_ZONE.left
    const deadZoneRight = width * DEAD_ZONE.right

    const safeZone = {
      x: x + deadZoneLeft,
      y: y + deadZoneTop,
      width: width - deadZoneLeft - deadZoneRight,
      height: height - deadZoneTop - deadZoneBottom,
    }

    ctx.save()

    // Draw dead zones if enabled
    if (config.showDeadZones) {
      drawDeadZones(
        ctx,
        x,
        y,
        width,
        height,
        deadZoneTop,
        deadZoneBottom,
        deadZoneLeft,
        deadZoneRight,
        safeZone,
      )
    }

    // Determine which grids to draw
    const gridsToDraw: Array<{
      resolution: GridResolution
      preset: GridConfig
    }> = []

    if (config.activeResolution === 'all') {
      gridsToDraw.push(
        {
          resolution: intentKeywords.gridResolutions.coarse,
          preset: DEFAULT_GRID_PRESETS.coarse,
        },
        {
          resolution: intentKeywords.gridResolutions.medium,
          preset: DEFAULT_GRID_PRESETS.medium,
        },
        {
          resolution: intentKeywords.gridResolutions.fine,
          preset: DEFAULT_GRID_PRESETS.fine,
        },
      )
    } else {
      gridsToDraw.push({
        resolution: config.activeResolution,
        preset: DEFAULT_GRID_PRESETS[config.activeResolution],
      })
    }

    // Draw each grid
    gridsToDraw.forEach(({ resolution, preset }) => {
      drawGrid(ctx, safeZone, preset, resolution, config.showCellLabels)
    })

    // Draw hand positions if enabled
    if (config.showHandPositions && gestureResult?.landmarks) {
      // Check if we have spatial data from worker
      const spatialData = config.spatialData?.()
      
      if (spatialData && spatialData.hands.length > 0) {
        // Use worker-computed spatial data
        drawHandPositionsFromSpatialData(
          ctx,
          spatialData,
          gestureResult,
          safeZone,
          gridsToDraw,
          mirrored,
          viewport,
        )
      } else {
        // Fall back to direct calculation
        drawHandPositionsFromGesture(
          ctx,
          gestureResult,
          x,
          y,
          width,
          height,
          safeZone,
          mirrored,
          gridsToDraw,
        )
      }
    }

    // Draw info panel
    drawInfoPanel(ctx, x, y, config.activeResolution, gridsToDraw)

    ctx.restore()
  }
}

// ============================================================================
// Helper Functions (Pure, Data-Driven)
// ============================================================================

function drawDeadZones(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  deadZoneTop: number,
  deadZoneBottom: number,
  deadZoneLeft: number,
  deadZoneRight: number,
  safeZone: { x: number; y: number; width: number; height: number },
) {
  // Draw dead zones (semi-transparent red overlay)
  ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'

  // Top dead zone
  ctx.fillRect(x, y, width, deadZoneTop)

  // Bottom dead zone
  ctx.fillRect(x, y + height - deadZoneBottom, width, deadZoneBottom)

  // Left dead zone
  ctx.fillRect(
    x,
    y + deadZoneTop,
    deadZoneLeft,
    height - deadZoneTop - deadZoneBottom,
  )

  // Right dead zone
  ctx.fillRect(
    x + width - deadZoneRight,
    y + deadZoneTop,
    deadZoneRight,
    height - deadZoneTop - deadZoneBottom,
  )

  // Draw dead zone borders (dashed red lines)
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 5])
  ctx.strokeRect(safeZone.x, safeZone.y, safeZone.width, safeZone.height)
  ctx.setLineDash([]) // Reset
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  safeZone: { x: number; y: number; width: number; height: number },
  config: GridConfig,
  resolution: GridResolution,
  showLabels: boolean,
) {
  const { cols, rows } = config
  const cellWidth = safeZone.width / cols
  const cellHeight = safeZone.height / rows
  const style = GRID_STYLES[resolution]

  ctx.strokeStyle = style.color
  ctx.lineWidth = style.lineWidth

  // Draw vertical lines
  for (let col = 0; col <= cols; col++) {
    const lineX = safeZone.x + col * cellWidth
    ctx.beginPath()
    ctx.moveTo(lineX, safeZone.y)
    ctx.lineTo(lineX, safeZone.y + safeZone.height)
    ctx.stroke()
  }

  // Draw horizontal lines
  for (let row = 0; row <= rows; row++) {
    const lineY = safeZone.y + row * cellHeight
    ctx.beginPath()
    ctx.moveTo(safeZone.x, lineY)
    ctx.lineTo(safeZone.x + safeZone.width, lineY)
    ctx.stroke()
  }

  // Draw cell labels if enabled
  if (showLabels) {
    ctx.fillStyle = style.color
    ctx.font = `${style.labelSize}px monospace`

    // Label positioning: clockwise rotation to avoid overlap in "all" mode
    // Coarse (biggest): top-left
    // Medium: top-right
    // Fine (smallest): bottom-right
    const labelOffset = getLabelOffset(
      resolution,
      cellWidth,
      cellHeight,
      style.labelSize,
    )

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellX = safeZone.x + col * cellWidth + labelOffset.x
        const cellY = safeZone.y + row * cellHeight + labelOffset.y
        ctx.fillText(`${col},${row}`, cellX, cellY)
      }
    }
  }
}

/**
 * Get label offset based on resolution to avoid overlap in "all" mode
 * Clockwise positioning: coarse=top-left, medium=top-right, fine=bottom-right
 */
function getLabelOffset(
  resolution: GridResolution,
  cellWidth: number,
  cellHeight: number,
  labelSize: number,
): { x: number; y: number } {
  const padding = 4

  switch (resolution) {
    case intentKeywords.gridResolutions.coarse:
      // Top-left
      return { x: padding, y: labelSize + 2 }
    case intentKeywords.gridResolutions.medium:
      // Top-right
      return { x: cellWidth - labelSize * 3, y: labelSize + 2 }
    case intentKeywords.gridResolutions.fine:
      // Bottom-right
      return { x: cellWidth - labelSize * 2.5, y: cellHeight - padding }
    default:
      return { x: padding, y: labelSize + 2 }
  }
}

/**
 * Draw hand positions using worker-computed spatial data
 * This shows the cells calculated by the worker's spatial hash
 */
function drawHandPositionsFromSpatialData(
  ctx: CanvasRenderingContext2D,
  spatialData: SpatialUpdateMessage,
  gestureResult: GestureRecognizerResult,
  safeZone: { x: number; y: number; width: number; height: number },
  gridsToHighlight: Array<{ resolution: GridResolution; preset: GridConfig }>,
  mirrored: boolean,
  viewport: { x: number; y: number; width: number; height: number },
) {
  spatialData.hands.forEach(({ handIndex, landmarkIndex, cells }) => {
    // Get the tracked landmark from gesture result
    const landmarks = gestureResult.landmarks[handIndex]
    if (!landmarks) return

    const landmark = landmarks[landmarkIndex]
    if (!landmark) return

    // Worker has already applied mirroring to cells, so we need to apply it to hand position too
    // to match the coordinate space
    const normalizedX = mirrored ? 1 - landmark.x : landmark.x
    const normalizedY = landmark.y

    // Convert normalized coordinates to viewport coordinates (not full canvas!)
    // MediaPipe landmarks are normalized to the video/viewport, not the letterboxed canvas
    const handX = viewport.x + normalizedX * viewport.width
    const handY = viewport.y + normalizedY * viewport.height

    // Normalize to safe zone
    const safeNormalizedX = (handX - safeZone.x) / safeZone.width
    const safeNormalizedY = (handY - safeZone.y) / safeZone.height
    const isInSafeZone =
      safeNormalizedX >= 0 &&
      safeNormalizedX <= 1 &&
      safeNormalizedY >= 0 &&
      safeNormalizedY <= 1

    // Draw cell highlights and lines for ALL grids using worker-computed cells
    // Worker now calculates cells in SAME coordinate space (safe zone + mirroring applied)
    gridsToHighlight.forEach(({ resolution, preset }) => {
      // Use worker-computed cell directly (now correct!)
      const cell = cells[resolution]

      const gridCellWidth = safeZone.width / preset.cols
      const gridCellHeight = safeZone.height / preset.rows

      const cellCenterX = safeZone.x + (cell.col + 0.5) * gridCellWidth
      const cellCenterY = safeZone.y + (cell.row + 0.5) * gridCellHeight

      const style = GRID_STYLES[resolution]

      // Draw line from hand to cell center
      ctx.strokeStyle = style.color
        .replace('0.25', '0.8')
        .replace('0.3', '0.8')
        .replace('0.4', '0.8')
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(handX, handY)
      ctx.lineTo(cellCenterX, cellCenterY)
      ctx.stroke()
      ctx.setLineDash([])

      // Draw dot at cell center
      ctx.fillStyle = style.color
        .replace('0.25', '0.6')
        .replace('0.3', '0.6')
        .replace('0.4', '0.6')
      ctx.beginPath()
      ctx.arc(cellCenterX, cellCenterY, 4, 0, Math.PI * 2)
      ctx.fill()

      // Draw cell highlight
      if (isInSafeZone) {
        ctx.strokeStyle = style.color
          .replace('0.25', '0.6')
          .replace('0.3', '0.6')
          .replace('0.4', '0.6')
        ctx.lineWidth = 2
        ctx.strokeRect(
          safeZone.x + cell.col * gridCellWidth,
          safeZone.y + cell.row * gridCellHeight,
          gridCellWidth,
          gridCellHeight,
        )
      }
    })

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

    // Draw hand label with landmark index and worker-computed cell position
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    const primaryCell = cells[gridsToHighlight[0].resolution]
    const statusLabel = isInSafeZone ? ' [WORKER]' : ' [DEAD ZONE]'
    ctx.fillText(
      `Hand ${handIndex + 1} [L${landmarkIndex}] [${primaryCell.col},${primaryCell.row}]${statusLabel}`,
      handX + 12,
      handY - 8,
    )

    // Draw additional info
    if (isInSafeZone) {
      ctx.font = '10px monospace'
      ctx.fillStyle = '#0FF'
      ctx.fillText(`Worker Spatial Data`, handX + 12, handY + 6)
    } else {
      ctx.fillStyle = '#FF4444'
      ctx.font = 'bold 10px monospace'
      ctx.fillText('UNRELIABLE', handX + 12, handY + 6)
    }
  })
}

/**
 * Draw hand positions using direct calculation (fallback)
 */
function drawHandPositionsFromGesture(
  ctx: CanvasRenderingContext2D,
  gestureResult: GestureRecognizerResult,
  x: number,
  y: number,
  width: number,
  height: number,
  safeZone: { x: number; y: number; width: number; height: number },
  mirrored: boolean,
  gridsToHighlight: Array<{ resolution: GridResolution; preset: GridConfig }>,
) {
  gestureResult.landmarks.forEach((landmarks, handIndex) => {
    // Use index finger tip (landmark 8) as representative position
    const indexTip = landmarks[8]
    if (!indexTip) return

    // Handle mirroring: when mirrored, flip X coordinate
    const normalizedX = mirrored ? 1 - indexTip.x : indexTip.x
    const normalizedY = indexTip.y

    // Convert normalized coordinates to viewport coordinates (for visual dot)
    const handX = x + normalizedX * width
    const handY = y + normalizedY * height

    // Convert to safe zone normalized coordinates (0-1 within safe zone)
    const safeNormalizedX =
      (normalizedX - DEAD_ZONE.left) / (1 - DEAD_ZONE.left - DEAD_ZONE.right)
    const safeNormalizedY =
      (normalizedY - DEAD_ZONE.top) / (1 - DEAD_ZONE.top - DEAD_ZONE.bottom)

    // Check if hand is in safe zone
    const isInSafeZone =
      safeNormalizedX >= 0 &&
      safeNormalizedX <= 1 &&
      safeNormalizedY >= 0 &&
      safeNormalizedY <= 1

    // Draw lines and center dots for ALL grids
    gridsToHighlight.forEach(({ resolution, preset }) => {
      const gridCols = preset.cols
      const gridRows = preset.rows
      const gridCellWidth = safeZone.width / gridCols
      const gridCellHeight = safeZone.height / gridRows

      // Calculate which cell the hand is in for THIS grid
      const gridCol = Math.max(
        0,
        Math.min(gridCols - 1, Math.floor(safeNormalizedX * gridCols)),
      )
      const gridRow = Math.max(
        0,
        Math.min(gridRows - 1, Math.floor(safeNormalizedY * gridRows)),
      )

      // Calculate cell center for THIS grid
      const cellCenterX = safeZone.x + (gridCol + 0.5) * gridCellWidth
      const cellCenterY = safeZone.y + (gridRow + 0.5) * gridCellHeight

      // Get the style for this resolution
      const style = GRID_STYLES[resolution]

      // Draw line from hand to cell center
      ctx.strokeStyle = style.color
        .replace('0.25', '0.8')
        .replace('0.3', '0.8')
        .replace('0.4', '0.8') // Increase opacity for line
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 5]) // Dashed line
      ctx.beginPath()
      ctx.moveTo(handX, handY)
      ctx.lineTo(cellCenterX, cellCenterY)
      ctx.stroke()
      ctx.setLineDash([]) // Reset to solid line

      // Draw dot at cell center
      ctx.fillStyle = style.color
        .replace('0.25', '0.6')
        .replace('0.3', '0.6')
        .replace('0.4', '0.6') // Increase opacity for dot
      ctx.beginPath()
      ctx.arc(cellCenterX, cellCenterY, 4, 0, Math.PI * 2)
      ctx.fill()
    })

    // Use the first grid for the distance label calculation
    const primaryGrid = gridsToHighlight[0]
    const { cols, rows } = primaryGrid.preset
    const handCol = Math.max(
      0,
      Math.min(cols - 1, Math.floor(safeNormalizedX * cols)),
    )
    const handRow = Math.max(
      0,
      Math.min(rows - 1, Math.floor(safeNormalizedY * rows)),
    )
    const dx = safeNormalizedX - (handCol + 0.5) / cols
    const dy = safeNormalizedY - (handRow + 0.5) / rows
    const distance = Math.sqrt(dx * dx + dy * dy)

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

    // Draw cell highlights for ALL grids (only if in safe zone)
    if (isInSafeZone) {
      gridsToHighlight.forEach(({ resolution, preset }) => {
        const gridCols = preset.cols
        const gridRows = preset.rows
        const gridCellWidth = safeZone.width / gridCols
        const gridCellHeight = safeZone.height / gridRows

        // Calculate which cell the hand is in for THIS grid
        const gridCol = Math.max(
          0,
          Math.min(gridCols - 1, Math.floor(safeNormalizedX * gridCols)),
        )
        const gridRow = Math.max(
          0,
          Math.min(gridRows - 1, Math.floor(safeNormalizedY * gridRows)),
        )

        // Get the style for this resolution
        const style = GRID_STYLES[resolution]

        // Draw cell highlight with the grid's color
        ctx.strokeStyle = style.color
          .replace('0.25', '0.6')
          .replace('0.3', '0.6')
          .replace('0.4', '0.6') // Increase opacity for highlight
        ctx.lineWidth = 2
        ctx.strokeRect(
          safeZone.x + gridCol * gridCellWidth,
          safeZone.y + gridRow * gridCellHeight,
          gridCellWidth,
          gridCellHeight,
        )
      })
    }

    // Draw hand label with distance
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    const statusLabel = isInSafeZone ? '' : ' [DEAD ZONE]'
    ctx.fillText(
      `Hand ${handIndex + 1} [${handCol},${handRow}]${statusLabel}`,
      handX + 12,
      handY - 8,
    )

    // Draw distance label (only if in safe zone)
    if (isInSafeZone) {
      ctx.font = '10px monospace'
      ctx.fillText(`d: ${distance.toFixed(3)}`, handX + 12, handY + 6)
    } else {
      // Warning for dead zone
      ctx.fillStyle = '#FF4444'
      ctx.font = 'bold 10px monospace'
      ctx.fillText('UNRELIABLE', handX + 12, handY + 6)
    }
  })
}

function drawInfoPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  activeResolution: GridResolution | 'all',
  gridsToDraw: Array<{ resolution: GridResolution; preset: GridConfig }>,
) {
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.fillRect(x + 10, y + 10, 240, 110)

  // Title
  ctx.fillStyle = '#00FF88'
  ctx.font = 'bold 12px monospace'
  ctx.fillText('Multi-Grid Overlay', x + 18, y + 28)

  // Active resolution
  ctx.fillStyle = '#fff'
  ctx.font = '11px monospace'
  const resolutionText =
    activeResolution === 'all' ? 'ALL' : activeResolution.toUpperCase()
  ctx.fillText(`Mode: ${resolutionText}`, x + 18, y + 44)

  // Grid info for each active grid
  let yOffset = 60
  gridsToDraw.forEach(({ resolution, preset }) => {
    const style = GRID_STYLES[resolution]
    ctx.fillStyle = style.color
    ctx.font = 'bold 10px monospace'
    ctx.fillText(
      `${resolution.toUpperCase()}: ${preset.cols}x${preset.rows}`,
      x + 18,
      y + yOffset,
    )
    yOffset += 14
  })

  // Dead zone info
  ctx.fillStyle = '#FF8888'
  ctx.font = 'bold 10px monospace'
  ctx.fillText('Dead Zones:', x + 18, y + 94)
  ctx.fillStyle = '#fff'
  ctx.font = '9px monospace'
  ctx.fillText(
    `T:${(DEAD_ZONE.top * 100).toFixed(0)}% B:${(DEAD_ZONE.bottom * 100).toFixed(0)}% L:${(DEAD_ZONE.left * 100).toFixed(0)}% R:${(DEAD_ZONE.right * 100).toFixed(0)}%`,
    x + 18,
    y + 108,
  )
}

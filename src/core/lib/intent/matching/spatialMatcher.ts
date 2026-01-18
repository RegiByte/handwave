/**
 * Intent Engine - Spatial Matcher
 *
 * Pure functions for matching spatial constraints (grid cells, regions).
 *
 * Responsibilities:
 * - Match positions against grid cells
 * - Check if positions are within regions
 * - Apply spatial constraints from intent definitions
 *
 * Philosophy:
 * - Pure functions only
 * - Clear spatial semantics
 */

import type { Cell, GridConfig, Position } from '@/core/lib/intent/core/types'
import { cellsEqual, normalizedToCell } from '@/core/lib/intent/spatial/grid'

// ============================================================================
// Grid Cell Matching
// ============================================================================

/**
 * Check if a position is in a specific grid cell
 *
 * @param position - Position to check (normalized 0-1)
 * @param targetCell - Target cell
 * @param gridConfig - Grid configuration
 * @returns True if position is in cell
 */
export function isInCell(
  position: Position,
  targetCell: Cell,
  gridConfig: GridConfig
): boolean {
  const positionCell = normalizedToCell(position, gridConfig)
  return cellsEqual(positionCell, targetCell)
}

/**
 * Check if a position is in any of the specified cells
 *
 * @param position - Position to check
 * @param targetCells - Array of target cells
 * @param gridConfig - Grid configuration
 * @returns True if position is in any cell
 */
export function isInAnyCells(
  position: Position,
  targetCells: Array<Cell>,
  gridConfig: GridConfig
): boolean {
  return targetCells.some((cell) => isInCell(position, cell, gridConfig))
}

// ============================================================================
// Region Matching
// ============================================================================

/**
 * Check if a position is within a rectangular region
 *
 * @param position - Position to check (normalized 0-1)
 * @param region - Region bounds
 * @returns True if position is in region
 */
export function isInRegion(
  position: Position,
  region: { min: Position; max: Position }
): boolean {
  return (
    position.x >= region.min.x &&
    position.x <= region.max.x &&
    position.y >= region.min.y &&
    position.y <= region.max.y &&
    position.z >= region.min.z &&
    position.z <= region.max.z
  )
}

/**
 * Check if a position is within a circular region (2D)
 *
 * @param position - Position to check
 * @param center - Circle center
 * @param radius - Circle radius
 * @returns True if position is in circle
 */
export function isInCircle(
  position: Position,
  center: Position,
  radius: number
): boolean {
  const dx = position.x - center.x
  const dy = position.y - center.y
  const distanceSquared = dx * dx + dy * dy

  return distanceSquared <= radius * radius
}

/**
 * Check if a position is within a spherical region (3D)
 *
 * @param position - Position to check
 * @param center - Sphere center
 * @param radius - Sphere radius
 * @returns True if position is in sphere
 */
export function isInSphere(
  position: Position,
  center: Position,
  radius: number
): boolean {
  const dx = position.x - center.x
  const dy = position.y - center.y
  const dz = position.z - center.z
  const distanceSquared = dx * dx + dy * dy + dz * dz

  return distanceSquared <= radius * radius
}

// ============================================================================
// Proximity Matching
// ============================================================================

/**
 * Check if two positions are within a distance threshold
 *
 * @param a - First position
 * @param b - Second position
 * @param threshold - Distance threshold
 * @returns True if positions are close
 */
export function arePositionsClose(
  a: Position,
  b: Position,
  threshold: number
): boolean {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  const distanceSquared = dx * dx + dy * dy + dz * dz

  return distanceSquared <= threshold * threshold
}

/**
 * Check if a position is close to any position in an array
 *
 * @param position - Position to check
 * @param targets - Array of target positions
 * @param threshold - Distance threshold
 * @returns True if close to any target
 */
export function isCloseToAny(
  position: Position,
  targets: Array<Position>,
  threshold: number
): boolean {
  return targets.some((target) =>
    arePositionsClose(position, target, threshold)
  )
}


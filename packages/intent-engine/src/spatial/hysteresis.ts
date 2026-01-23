/**
 * Intent Engine - Hysteresis System
 *
 * Prevents rapid cell switching through hysteresis (sticky cells).
 *
 * Responsibilities:
 * - Track stable cell per hand
 * - Prevent jittery cell transitions
 * - Configurable threshold
 * - Pure functions with state tracking
 *
 * Philosophy:
 * - Stability over precision
 * - Clear threshold semantics
 * - Predictable behavior
 */

import type {
  Cell,
  GridConfig,
  HysteresisConfig,
  HysteresisState,
  Position,
} from '../vocabulary'
import {
  cellsEqual,
  getCellCenter,
  normalizedToCell,
} from './grid'

// ============================================================================
// Hysteresis State Management
// ============================================================================

/**
 * Create initial hysteresis state
 *
 * @param initialCell - Starting cell
 * @returns Initial hysteresis state
 */
export function createHysteresisState(initialCell: Cell): HysteresisState {
  return {
    stableCell: initialCell,
    currentCell: initialCell,
    distanceFromCenter: 0,
  }
}

/**
 * Update hysteresis state with new position
 *
 * @param state - Current hysteresis state
 * @param newPosition - New position
 * @param gridConfig - Grid configuration
 * @param hysteresisConfig - Hysteresis configuration
 * @returns Updated hysteresis state
 */
export function updateHysteresis(
  state: HysteresisState,
  newPosition: Position,
  gridConfig: GridConfig,
  hysteresisConfig: HysteresisConfig
): HysteresisState {
  // Convert position to cell
  const newCell = normalizedToCell(newPosition, gridConfig)

  // If same cell as stable cell, just update distance
  if (cellsEqual(newCell, state.stableCell)) {
    const center = getCellCenter(state.stableCell, gridConfig)
    const distance = calculateDistanceFromCenter(newPosition, center)

    return {
      stableCell: state.stableCell,
      currentCell: newCell,
      distanceFromCenter: distance,
    }
  }

  // Different cell - check if we should switch
  const center = getCellCenter(state.stableCell, gridConfig)
  const distance = calculateDistanceFromCenter(newPosition, center)

  if (shouldSwitchCell(distance, hysteresisConfig.threshold)) {
    // Switch to new cell
    const newCenter = getCellCenter(newCell, gridConfig)
    const newDistance = calculateDistanceFromCenter(newPosition, newCenter)

    return {
      stableCell: newCell,
      currentCell: newCell,
      distanceFromCenter: newDistance,
    }
  }

  // Stay in stable cell
  return {
    stableCell: state.stableCell,
    currentCell: newCell,
    distanceFromCenter: distance,
  }
}

// ============================================================================
// Hysteresis Logic
// ============================================================================

/**
 * Check if we should switch to a new cell
 *
 * @param distanceFromCenter - Distance from current stable cell center (normalized)
 * @param threshold - Hysteresis threshold (0-1, percentage of cell size)
 * @returns True if should switch
 */
export function shouldSwitchCell(
  distanceFromCenter: number,
  threshold: number
): boolean {
  // Switch if distance exceeds threshold
  // Threshold is relative to cell size (e.g., 0.1 = 10% of cell size)
  return distanceFromCenter > threshold
}

/**
 * Calculate normalized distance from cell center
 *
 * @param position - Position to check
 * @param center - Cell center
 * @returns Normalized distance (relative to cell size)
 */
export function calculateDistanceFromCenter(
  position: Position,
  center: Position
): number {
  const dx = position.x - center.x
  const dy = position.y - center.y

  return Math.sqrt(dx * dx + dy * dy)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the stable cell from hysteresis state
 *
 * @param state - Hysteresis state
 * @returns Stable cell
 */
export function getStableCell(state: HysteresisState): Cell {
  return state.stableCell
}

/**
 * Check if position is stable (not near cell boundary)
 *
 * @param state - Hysteresis state
 * @param stabilityThreshold - Threshold for stability (0-1)
 * @returns True if position is stable
 */
export function isPositionStable(
  state: HysteresisState,
  stabilityThreshold: number
): boolean {
  return state.distanceFromCenter < stabilityThreshold
}

/**
 * Reset hysteresis state to a new cell
 *
 * @param state - Current state
 * @param newCell - New cell to reset to
 * @returns Reset state
 */
export function resetHysteresis(
  _state: HysteresisState,
  newCell: Cell
): HysteresisState {
  return {
    stableCell: newCell,
    currentCell: newCell,
    distanceFromCenter: 0,
  }
}

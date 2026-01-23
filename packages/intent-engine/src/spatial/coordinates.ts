/**
 * Intent Engine - Coordinate Transforms
 *
 * Pure functions for transforming between coordinate systems.
 *
 * Responsibilities:
 * - Transform between normalized, viewport, and screen coordinates
 * - Handle mirroring (horizontal flip)
 * - Viewport mapping
 * - Pure transformation functions
 *
 * Philosophy:
 * - Clear coordinate system semantics
 * - Composable transformations
 * - Handles edge cases
 */

import type { CoordinateSystem, Position, Viewport } from '../vocabulary'

// ============================================================================
// Coordinate System Transforms
// ============================================================================

/**
 * Transform position between coordinate systems
 *
 * @param position - Position to transform
 * @param from - Source coordinate system
 * @param to - Target coordinate system
 * @param viewport - Viewport configuration
 * @param mirrored - Whether to apply horizontal mirroring
 * @returns Transformed position
 */
export function transformCoordinates(
  position: Position,
  from: CoordinateSystem,
  to: CoordinateSystem,
  viewport: Viewport,
  mirrored: boolean = false
): Position {
  // If same system, just apply mirroring if needed
  if (from === to) {
    return mirrored ? applyMirroring(position) : position
  }

  // Transform to normalized as intermediate
  let normalized: Position

  switch (from) {
    case 'normalized':
      normalized = position
      break
    case 'viewport':
      normalized = viewportToNormalized(position, viewport)
      break
    case 'screen':
      normalized = screenToNormalized(position, viewport)
      break
    default:
      normalized = position
      break
  }

  // Apply mirroring in normalized space
  if (mirrored) {
    normalized = applyMirroring(normalized)
  }

  // Transform from normalized to target
  switch (to) {
    case 'normalized':
      return normalized
    case 'viewport':
      return normalizedToViewport(normalized, viewport)
    case 'screen':
      return normalizedToScreen(normalized, viewport)
    default:
      return normalized
  }
}

// ============================================================================
// Normalized ↔ Viewport
// ============================================================================

/**
 * Convert normalized coordinates to viewport coordinates
 *
 * @param position - Normalized position (0-1)
 * @param viewport - Viewport configuration
 * @returns Viewport position
 */
export function normalizedToViewport(
  position: Position,
  viewport: Viewport
): Position {
  return {
    x: position.x * viewport.width,
    y: position.y * viewport.height,
    z: position.z, // Z is not affected by viewport
  }
}

/**
 * Convert viewport coordinates to normalized coordinates
 *
 * @param position - Viewport position
 * @param viewport - Viewport configuration
 * @returns Normalized position (0-1)
 */
export function viewportToNormalized(
  position: Position,
  viewport: Viewport
): Position {
  return {
    x: viewport.width > 0 ? position.x / viewport.width : 0,
    y: viewport.height > 0 ? position.y / viewport.height : 0,
    z: position.z,
  }
}

// ============================================================================
// Normalized ↔ Screen
// ============================================================================

/**
 * Convert normalized coordinates to screen coordinates
 *
 * @param position - Normalized position (0-1)
 * @param viewport - Viewport configuration (includes offset)
 * @returns Screen position
 */
export function normalizedToScreen(
  position: Position,
  viewport: Viewport
): Position {
  return {
    x: viewport.x + position.x * viewport.width,
    y: viewport.y + position.y * viewport.height,
    z: position.z,
  }
}

/**
 * Convert screen coordinates to normalized coordinates
 *
 * @param position - Screen position
 * @param viewport - Viewport configuration (includes offset)
 * @returns Normalized position (0-1)
 */
export function screenToNormalized(
  position: Position,
  viewport: Viewport
): Position {
  return {
    x: viewport.width > 0 ? (position.x - viewport.x) / viewport.width : 0,
    y: viewport.height > 0 ? (position.y - viewport.y) / viewport.height : 0,
    z: position.z,
  }
}

// ============================================================================
// Mirroring
// ============================================================================

/**
 * Apply horizontal mirroring to position
 *
 * @param position - Position to mirror
 * @returns Mirrored position
 */
export function applyMirroring(position: Position): Position {
  return {
    x: 1 - position.x, // Flip horizontally
    y: position.y, // Y unchanged
    z: position.z, // Z unchanged
  }
}

/**
 * Remove horizontal mirroring from position
 *
 * @param position - Mirrored position
 * @returns Unmirrored position
 */
export function removeMirroring(position: Position): Position {
  // Mirroring is symmetric, so same operation
  return applyMirroring(position)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clamp position to normalized range [0, 1]
 *
 * @param position - Position to clamp
 * @returns Clamped position
 */
export function clampNormalized(position: Position): Position {
  return {
    x: Math.max(0, Math.min(1, position.x)),
    y: Math.max(0, Math.min(1, position.y)),
    z: position.z, // Z can be outside [0, 1]
  }
}

/**
 * Check if position is within normalized bounds
 *
 * @param position - Position to check
 * @returns True if within [0, 1] range
 */
export function isNormalizedInBounds(position: Position): boolean {
  return (
    position.x >= 0 &&
    position.x <= 1 &&
    position.y >= 0 &&
    position.y <= 1
  )
}

/**
 * Check if position is within viewport bounds
 *
 * @param position - Viewport position to check
 * @param viewport - Viewport configuration
 * @returns True if within viewport
 */
export function isInViewport(position: Position, viewport: Viewport): boolean {
  return (
    position.x >= 0 &&
    position.x <= viewport.width &&
    position.y >= 0 &&
    position.y <= viewport.height
  )
}

/**
 * Get viewport aspect ratio
 *
 * @param viewport - Viewport configuration
 * @returns Aspect ratio (width / height)
 */
export function getAspectRatio(viewport: Viewport): number {
  return viewport.height > 0 ? viewport.width / viewport.height : 1
}

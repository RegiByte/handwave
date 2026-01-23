/**
 * @handwave/intent-engine
 * 
 * Core intent recognition engine for gesture-based interactions.
 * Pure functions and factory functions for stateful logic.
 */

// ============================================================================
// Vocabulary - Single source of truth for all constants and schemas
// ============================================================================

export * from './vocabulary'

// ============================================================================
// Spatial - Coordinate transforms, grid system, and hysteresis
// ============================================================================

export * from './spatial'

// ============================================================================
// Matching - Pattern matching for gestures, contacts, and spatial constraints
// ============================================================================

export * from './matching'

// ============================================================================
// Core - Engine orchestration, frame history, and action lifecycle
// ============================================================================

export * from './core'

// ============================================================================
// DSL - Declarative intent definition with type-safe pattern builders
// ============================================================================

export * from './dsl'

// ============================================================================
// Package Metadata
// ============================================================================

export const PACKAGE_NAME = '@handwave/intent-engine'
export const VERSION = '0.1.0'

// ============================================================================
// Utilities (temporary - for verification)
// ============================================================================

/**
 * Simple utility to verify the package is working
 */
export function createSimpleCounter() {
  let count = 0

  return {
    increment: () => ++count,
    decrement: () => --count,
    get: () => count,
    reset: () => {
      count = 0
    },
  }
}

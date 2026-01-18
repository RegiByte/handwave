/**
 * Intent Engine - Core Types
 *
 * Core type definitions for the Intent Engine system.
 * These types extend and compose the vocabulary schemas.
 *
 * Responsibilities:
 * - Define Intent type with lifecycle hooks
 * - Define engine API types
 * - Define internal state types
 * - Re-export vocabulary types for convenience
 */

import type {
  ActionContext,
  ActiveAction,
  Cell,
  ContactPattern,
  EndReason,
  FrameSnapshot,
  GesturePattern,
  GridConfig,
  HysteresisConfig,
  IntentDefinition,
  IntentEngineConfig,
  IntentEvent,
  Pattern,
  Position,
  SpatialConfig,
  TemporalConfig,
  Vector3,
  Viewport,
} from '@/core/lib/intent/vocabulary'

// ============================================================================
// Re-export vocabulary types for convenience
// ============================================================================

export type {
  Vector3,
  Position,
  Cell,
  GridConfig,
  HysteresisConfig,
  Viewport,
  GesturePattern,
  ContactPattern,
  Pattern,
  SpatialConfig,
  TemporalConfig,
  ActionContext,
  ActiveAction,
  IntentEvent,
  EndReason,
  FrameSnapshot,
  IntentDefinition,
  IntentEngineConfig,
}

// ============================================================================
// Intent Type (with lifecycle hooks)
// ============================================================================

/**
 * Intent definition with lifecycle hooks
 *
 * This is the core type for defining intents.
 * It extends IntentDefinition with typed lifecycle hooks.
 *
 * Note: modifier and action use Pattern (discriminated union)
 */
export type Intent<
  TStart extends IntentEvent = IntentEvent,
  TUpdate extends IntentEvent = IntentEvent,
  TEnd extends IntentEvent = IntentEvent,
> = {
  id: string
  modifier?: Pattern
  action: Pattern
  spatial?: SpatialConfig
  temporal?: TemporalConfig

  // Lifecycle hooks
  onStart: (context: ActionContext) => TStart
  onUpdate: (context: ActionContext) => TUpdate
  onEnd: (context: ActionContext & { reason: EndReason }) => TEnd
}

// ============================================================================
// Intent Engine API Types
// ============================================================================

/**
 * Intent engine public API
 */
export type IntentEngine = {
  // Event subscription
  on: (eventType: string, callback: IntentEventCallback) => UnsubscribeFn
  onAny: (callback: IntentEventCallback) => UnsubscribeFn
  off: (eventType: string, callback: IntentEventCallback) => void

  // State access
  getActiveActions: () => Map<string, ActiveAction>
  getFrameHistory: () => Array<FrameSnapshot>
  getConfig: () => IntentEngineConfig

  // Control
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void

  // Lifecycle
  destroy: () => void
}

/**
 * Intent event callback
 */
export type IntentEventCallback = (event: IntentEvent) => void

/**
 * Unsubscribe function
 */
export type UnsubscribeFn = () => void

// ============================================================================
// Internal State Types
// ============================================================================

/**
 * Hysteresis state (for stable cell tracking)
 */
export type HysteresisState = {
  stableCell: Cell
  currentCell: Cell
  distanceFromCenter: number
}

/**
 * Frame processing result (internal)
 */
export type FrameProcessingResult = {
  eventsToEmit: Array<IntentEvent>
  updatedActions: Map<string, ActiveAction>
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if pattern is a gesture pattern
 */
export function isGesturePattern(
  pattern: Pattern
): pattern is GesturePattern {
  return pattern.type === 'gesture'
}

/**
 * Check if pattern is a contact pattern
 */
export function isContactPattern(
  pattern: Pattern
): pattern is ContactPattern {
  return pattern.type === 'contact'
}


/**
 * DSL Module
 * 
 * Declarative, type-safe DSL for defining gesture-based intents.
 * 
 * @example
 * ```ts
 * import { gesture, pinch, anyOf, allOf, intent } from '@handwave/intent-engine'
 *
 * // Build patterns fluently
 * const leftFist = gesture('Closed_Fist').withHand('left')
 * const rightPinch = pinch('index').withHand('right')
 *
 * // Define intents
 * const scaleIntent = intent({
 *   id: 'transform:scale',
 *   pattern: allOf(leftFist, rightPinch),
 *   temporal: { minDuration: 100 },
 * })
 *
 * // Subscribe with full type safety
 * engine.on(scaleIntent.events.start, (event) => {
 *   console.log(event.position, event.hand)
 * })
 * ```
 */

// Pattern builders
export { gesture, pinch, anyOf, allOf, sequence, bidirectional, gestures, pinches } from './patterns'
export type { SequenceExpr, CompositeExpr } from './patterns'

// Intent builder
export { intent, isIntent, getIntentDef, getEventTypes } from './intent'

// Pattern matching
export {
  matchPatternExpr,
  matchPatternDef,
  extractMatchedHandFromPattern,
  extractAllMatchingHands,
  calculateGesturePosition,
} from './matching'

// Engine adapter
export { processFrameV2, createSubscriptionManager, resolveConflictsV2 } from './engine'
export type { ConflictResolutionConfig } from './engine'

// Types (only DSL-specific types, not re-exporting vocabulary/core types)
export type {
  // Pattern types (DSL-specific)
  GesturePatternDef,
  PinchPatternDef,
  CompositePatternDef,
  SequencePatternDef,
  PatternExpr,
  PatternExprInternals,
  GestureExpr,
  PinchExpr,
  SomePatternExpr,

  // Intent types (DSL-specific)
  Intent,
  GroupResolutionStrategy,
  GroupLimitConfig,
  IntentDef,
  IntentEventDescriptor,

  // Event types (DSL-specific)
  StandardEventBase,
  StandardStartEvent,
  StandardUpdateEvent,
  StandardEndEvent,
  StandardIntentEvents,

  // Inference utilities (DSL-specific)
  IntentId,
  IntentEvents,
  IntentStartEvent,
  IntentUpdateEvent,
  IntentEndEvent,
  DescriptorEvent,

  // Subscription types (DSL-specific)
  EventCallback,
  Unsubscribe,
  EventSubscriptionAPI,
} from './types'

// Note: The following types are available from other modules:
// - GestureName, FingerName, HandIdentifier, EndReason (from vocabulary)
// - Vector3, Position, Cell (from vocabulary)
// - PatternType, TemporalConfig, ResolutionConfig (from vocabulary)
// - Intent (from core)
// Import from '@handwave/intent-engine' to get all types

/**
 * Intent DSL v2 - Public API
 *
 * A fluent, composable, type-safe DSL for defining gesture-based intents.
 *
 * @example
 * ```ts
 * import { gesture, pinch, anyOf, allOf, intent, gestures, pinches } from './dsl'
 *
 * // Build patterns fluently
 * const leftFist = gesture('Closed_Fist').withHand('left')
 * const rightPinch = pinch('index').withHand('right').withThreshold(0.05)
 *
 * // Use composition operators
 * const eitherFist = anyOf(
 *   gesture('Closed_Fist').withHand('left'),
 *   gesture('Closed_Fist').withHand('right')
 * )
 *
 * // Or use method chaining
 * const sameThing = gesture('Closed_Fist').withHand('left')
 *   .or(gesture('Closed_Fist').withHand('right'))
 *
 * // Define intents - pure declarations, no handlers!
 * const scaleIntent = intent({
 *   id: 'transform:scale',
 *   pattern: allOf(leftFist, rightPinch),
 *   temporal: { minDuration: 100, maxGap: 200 },
 *   resolution: { group: 'transform', priority: 10 },
 * })
 *
 * // Subscribe with full type safety
 * engine.on(scaleIntent.events.start, (event) => {
 *   // event is StandardStartEvent<'transform:scale'>
 *   console.log(event.position, event.hand, event.handIndex)
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
export { processFrameV2, createSubscriptionManager, resolveConflicts } from './engine'
export type { ConflictResolutionConfig } from './engine'

// Braided resource
export { intentEngineResource } from './intentEngineResource'
export type { IntentEngineAPI } from './intentEngineResource'

// Types
export type {
  // Primitives
  GestureName,
  FingerName,
  HandIdentifier,
  EndReason,
  Vector3,
  Position,
  Cell,

  // Pattern types
  PatternType,
  PatternDef,
  GesturePatternDef,
  PinchPatternDef,
  CompositePatternDef,
  SequencePatternDef,
  PatternExpr,
  PatternExprInternals,
  GestureExpr,
  PinchExpr,
  SomePatternExpr,

  // Intent types
  TemporalConfig,
  ResolutionConfig,
  GroupResolutionStrategy,
  GroupLimitConfig,
  IntentDef,
  Intent,
  IntentEventDescriptor,

  // Event types
  StandardEventBase,
  StandardStartEvent,
  StandardUpdateEvent,
  StandardEndEvent,
  StandardIntentEvents,

  // Inference utilities
  IntentId,
  IntentEvents,
  IntentStartEvent,
  IntentUpdateEvent,
  IntentEndEvent,
  DescriptorEvent,

  // Subscription types
  EventCallback,
  Unsubscribe,
} from './types'

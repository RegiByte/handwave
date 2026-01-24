/**
 * Intent DSL v2 - Core Type Definitions
 *
 * A fluent, composable, type-safe DSL for defining gesture-based intents.
 * Inspired by Zod's architecture for maximum type inference.
 *
 * Philosophy:
 * - Everything is information processing
 * - Simple rules compose
 * - No central governor needed
 * - 100% type-safe by design
 */
import type { Expand } from '@/core/types'


// ============================================================================
// PRIMITIVE TYPES (from vocabulary, re-exported for convenience)
// ============================================================================

/** MediaPipe gesture names */
export type GestureName =
  | 'Closed_Fist'
  | 'Open_Palm'
  | 'Pointing_Up'
  | 'Thumb_Up'
  | 'Thumb_Down'
  | 'Victory'
  | 'ILoveYou'
  | 'None'

/** Finger names for pinch detection */
export type FingerName = 'index' | 'middle' | 'ring' | 'pinky'

/** Hand identifier - 'any' means match either hand */
export type HandIdentifier = 'left' | 'right' | 'any'

/** Why an action ended */
export type EndReason = 'completed' | 'cancelled' | 'timeout'

// ============================================================================
// SPATIAL TYPES
// ============================================================================

/** 3D vector for position, velocity, etc. */
export interface Vector3 {
  x: number
  y: number
  z: number
}

/** Position alias */
export type Position = Vector3

/** Grid cell coordinates */
export interface Cell {
  col: number
  row: number
}

// ============================================================================
// PATTERN EXPRESSION TYPES
// ============================================================================

/** Pattern discriminator types */
export type PatternType = 'gesture' | 'pinch' | 'anyOf' | 'allOf' | 'sequence'

/** Base definition shape for all patterns */
interface BasePatternDef {
  type: PatternType
}

/** Gesture pattern definition */
export interface GesturePatternDef extends BasePatternDef {
  type: 'gesture'
  gesture: GestureName
  hand: HandIdentifier
  confidence: number
}

/** Pinch pattern definition */
export interface PinchPatternDef extends BasePatternDef {
  type: 'pinch'
  finger: FingerName
  hand: HandIdentifier
  threshold: number
}

/** Composite pattern definition (anyOf/allOf) */
export interface CompositePatternDef extends BasePatternDef {
  type: 'anyOf' | 'allOf'
  patterns: Array<PatternExpr>
  /** Index of the primary pattern (used for position calculation) */
  primaryIndex?: number
}

/** Sequence pattern definition */
export interface SequencePatternDef extends BasePatternDef {
  type: 'sequence'
  patterns: Array<PatternExpr>
  mode: 'sequential' | 'concurrent'
  within?: number // Max time between patterns (for sequential mode)
  /** Index of the primary pattern (used for position calculation) */
  primaryIndex?: number
}

/** Union of all pattern definitions */
export type PatternDef =
  | GesturePatternDef
  | PinchPatternDef
  | CompositePatternDef
  | SequencePatternDef

// ============================================================================
// PATTERN EXPRESSION INTERNALS (Zod-inspired _intent structure)
// ============================================================================

/**
 * Internal structure for pattern expressions.
 * Hidden from users but accessible for advanced use cases.
 */
export interface PatternExprInternals<TDef extends PatternDef = PatternDef> {
  /** The pattern definition */
  def: TDef
  /** Set of applied modifiers (for debugging/introspection) */
  traits: Set<string>
  /** Computed metadata bag */
  bag: {
    hand?: HandIdentifier
    confidence?: number
    finger?: FingerName
    threshold?: number
  }
  /** Whether this pattern is marked as primary (for position calculation) */
  isPrimary?: boolean
}

/**
 * Pattern expression with internals.
 * This is what all pattern builders return.
 */
export interface PatternExpr<TDef extends PatternDef = PatternDef> {
  /** Internal structure (like Zod's _zod) */
  readonly _intent: PatternExprInternals<TDef>

  // Fluent modifiers - return new expressions (immutable)
  withHand: <THhand extends HandIdentifier>(
    hand: THhand
  ) => PatternExpr<TDef & { hand: THhand }>

  withConfidence: (confidence: number) => PatternExpr<TDef>
  
  withThreshold: (threshold: number) => PatternExpr<TDef>

  // Composition operators
  or: <T extends PatternExpr>(other: T) => PatternExpr<CompositePatternDef>
  and: <T extends PatternExpr>(other: T) => PatternExpr<CompositePatternDef>

  // Mark as primary (for position calculation in composite patterns)
  primary: () => PatternExpr<TDef>
  
  // Legacy index-based API (deprecated in favor of .primary())
  withPrimary: (index: number) => PatternExpr<TDef>
}

/** Type alias for any pattern expression */
export type SomePatternExpr = PatternExpr<PatternDef>

// ============================================================================
// GESTURE EXPRESSION (specific to gesture patterns)
// ============================================================================

export interface GestureExpr<TDef extends GesturePatternDef = GesturePatternDef>
  extends PatternExpr<TDef> {
  readonly _intent: PatternExprInternals<TDef>
  
  primary: () => GestureExpr<TDef>
}

// ============================================================================
// PINCH EXPRESSION (specific to pinch patterns)
// ============================================================================

export interface PinchExpr<TDef extends PinchPatternDef = PinchPatternDef>
  extends PatternExpr<TDef> {
  readonly _intent: PatternExprInternals<TDef>

  /** Set the distance threshold for pinch detection */
  withThreshold: (threshold: number) => PinchExpr<TDef>
  
  primary: () => PinchExpr<TDef>
}

// ============================================================================
// INTENT CONFIGURATION TYPES
// ============================================================================

/** Temporal configuration */
export interface TemporalConfig {
  /** Minimum duration to hold gesture before activation (ms) */
  minDuration?: number
  /** Maximum gap allowed during active state (ms) */
  maxGap?: number
}

/** Resolution strategy for groups */
export type GroupResolutionStrategy = 
  | 'winner-takes-all'  // Only the highest priority/specificity intent
  | 'top-k'             // Top K intents by priority/specificity
  | 'custom'            // Custom resolver function

/** Group limit configuration */
export interface GroupLimitConfig {
  /** Maximum concurrent intents in this group */
  max: number
  /** Resolution strategy for this group */
  strategy?: GroupResolutionStrategy
}

/** Resolution policy for conflict handling */
export interface ResolutionConfig {
  /** Group name - only intents in same group compete */
  group?: string
  /** Priority within group - higher wins */
  priority?: number
  /** Auto-calculated specificity score (internal) */
  _specificity?: number
}

// ============================================================================
// STANDARD EVENT TYPES (like DOM events - just data, no transformation)
// ============================================================================

/**
 * Base event fields present in all intent events.
 * TId is a template literal type for the event type string.
 */
export interface StandardEventBase<
  TId extends string = string,
  TPhase extends string = string
> {
  /** Event type: `${intentId}:${phase}` */
  type: `${TId}:${TPhase}`
  /** Unique action ID for this lifecycle */
  id: string
  /** Timestamp when event occurred */
  timestamp: number
  /** Normalized position (0-1) */
  position: Position
  /** Grid cell */
  cell: Cell
  /** Which hand ('left' | 'right') */
  hand: 'left' | 'right'
  /** Hand instance index (0-3) */
  handIndex: number
  /** Head instance index (0-1 for multi-person support) */
  headIndex: number
}

/** Start event - emitted when intent activates */
export interface StandardStartEvent<TId extends string = string>
  extends StandardEventBase<TId, 'start'> {}

/** Update event - emitted each frame while active */
export interface StandardUpdateEvent<TId extends string = string>
  extends StandardEventBase<TId, 'update'> {
  /** Velocity vector */
  velocity: Vector3
  /** Duration since start (ms) */
  duration: number
}

/** End event - emitted when intent ends */
export interface StandardEndEvent<TId extends string = string>
  extends StandardEventBase<TId, 'end'> {
  /** Velocity vector */
  velocity: Vector3
  /** Total duration (ms) */
  duration: number
  /** Why the intent ended */
  reason: EndReason
}

/** All standard events for an intent */
export type StandardIntentEvents<TId extends string = string> = {
  start: StandardStartEvent<TId>
  update: StandardUpdateEvent<TId>
  end: StandardEndEvent<TId>
}

// ============================================================================
// INTENT DEFINITION
// ============================================================================

/**
 * Intent definition - pure declaration, no handlers.
 * Events are derived automatically based on the id.
 */
export interface IntentDef<
  TId extends string = string,
  TPattern extends SomePatternExpr = SomePatternExpr
> {
  /** Unique intent identifier (used in event types) */
  id: TId
  /** The pattern to match */
  pattern: TPattern
  /** Temporal constraints */
  temporal?: TemporalConfig
  /** Conflict resolution policy */
  resolution?: ResolutionConfig
}
/**
 * Intent object with type-safe event accessors.
 * This is what `intent()` returns.
 */
export interface Intent<
  TId extends string = string,
  TPattern extends SomePatternExpr = SomePatternExpr
> {
  /** Internal definition */
  readonly _intent: {
    def: IntentDef<TId, TPattern>
  }

  /** Intent ID */
  readonly id: TId
  /** The pattern to match */
  readonly pattern: TPattern
  /** Temporal config */
  readonly temporal: TemporalConfig | undefined
  /** Resolution config */
  readonly resolution: ResolutionConfig | undefined

  /**
   * Type-safe event accessors.
   * Use these to subscribe to specific event phases.
   */
  readonly events: {
    /** Start event descriptor */
    start: IntentEventDescriptor<StandardStartEvent<TId>>
    /** Update event descriptor */
    update: IntentEventDescriptor<StandardUpdateEvent<TId>>
    /** End event descriptor */
    end: IntentEventDescriptor<StandardEndEvent<TId>>
    /** All events (union type) */
    all: IntentEventDescriptor<
      StandardStartEvent<TId> | StandardUpdateEvent<TId> | StandardEndEvent<TId>
    >
  }
}

/**
 * Event descriptor - used for type-safe subscriptions.
 * Contains the event type string and phantom type for inference.
 */
export interface IntentEventDescriptor<TEvent> {
  /** Event type string (e.g., 'particles:spawn:start') */
  readonly type: string
  /** Phantom type for inference - not actually present at runtime */
  readonly _event: TEvent
}

// ============================================================================
// TYPE INFERENCE UTILITIES
// ============================================================================

/** Extract the ID from an intent */
export type IntentId<T> = T extends Intent<infer Id, any> ? Id : never

/** Extract all event types from an intent */
export type IntentEvents<T extends Intent> = T extends Intent<infer Id, any>
  ? StandardIntentEvents<Id>
  : never

/** Extract a specific event type from an intent */
export type IntentStartEvent<T extends Intent> = IntentEvents<T>['start']
export type IntentUpdateEvent<T extends Intent> = IntentEvents<T>['update']
export type IntentEndEvent<T extends Intent> = IntentEvents<T>['end']

/** Extract the event type from a descriptor */
export type DescriptorEvent<T> = T extends IntentEventDescriptor<infer E> ? E : never

// ============================================================================
// ENGINE SUBSCRIPTION TYPES
// ============================================================================

/**
 * Expand utility - flattens type aliases for better IDE hover display.
 * Re-exported from core for convenience.
 */

/** Event callback type with expanded type display */
export type EventCallback<TEvent> = (event: Expand<TEvent>) => void

/** Unsubscribe function */
export type Unsubscribe = () => void

/**
 * Type-safe event subscription API.
 * Accepts event descriptors and provides fully typed callbacks.
 */
export type EventSubscriptionAPI = {
  /**
   * Subscribe to a specific event using an event descriptor.
   * 
   * @example
   * ```ts
   * const vortexIntent = intent({ id: 'vortex', pattern: ... })
   * 
   * // Subscribe to start event
   * engine.subscribe(vortexIntent.events.start, (event) => {
   *   // event is typed as StandardStartEvent<'vortex'>
   *   console.log(event.position, event.hand)
   * })
   * 
   * // Subscribe to all events
   * engine.subscribe(vortexIntent.events.all, (event) => {
   *   // event is union: StandardStartEvent | StandardUpdateEvent | StandardEndEvent
   *   if (event.type.endsWith(':start')) {
   *     // Handle start
   *   }
   * })
   * ```
   */
  subscribe: <TEvent>(
    descriptor: IntentEventDescriptor<TEvent>,
    callback: EventCallback<TEvent>
  ) => Unsubscribe

  /**
   * Subscribe to multiple event descriptors at once.
   * Returns a single unsubscribe function that removes all subscriptions.
   * 
   * @example
   * ```ts
   * engine.subscribeMany([
   *   [vortexIntent.events.start, handleVortexStart],
   *   [spawnIntent.events.start, handleSpawnStart],
   * ])
   * ```
   */
  subscribeMany: <TEvent>(
    subscriptions: Array<[IntentEventDescriptor<TEvent>, EventCallback<TEvent>]>
  ) => Unsubscribe
}

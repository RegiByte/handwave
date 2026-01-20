/**
 * Intent DSL v2 - Intent Builder
 *
 * Creates type-safe intent definitions with derived event types.
 * No handlers needed - just declare what patterns to match,
 * and the engine generates standard events.
 *
 * Usage:
 *   const spawnIntent = intent({
 *     id: 'particles:spawn',
 *     pattern: gesture('Pointing_Up').withHand('left'),
 *     temporal: { minDuration: 100 },
 *   })
 *
 *   // Type-safe event access
 *   engine.on(spawnIntent.events.start, (event) => {
 *     // event is fully typed as StandardStartEvent<'particles:spawn'>
 *   })
 */

import type {
  Intent,
  IntentDef,
  IntentEventDescriptor,
  ResolutionConfig,
  SomePatternExpr,
  StandardEndEvent,
  StandardStartEvent,
  StandardUpdateEvent,
  TemporalConfig,
} from './types'

// ============================================================================
// SPECIFICITY CALCULATION
// ============================================================================

/**
 * Calculate the specificity score for a pattern.
 * Higher scores indicate more specific patterns.
 */
function calculateSpecificity(pattern: SomePatternExpr): number {
  let score = 0

  const def = pattern._intent.def

  // Base pattern type scores
  switch (def.type) {
    case 'gesture':
    case 'pinch':
      score += 1
      break
    case 'allOf':
      // More specific - requires multiple patterns
      score += 10 + def.patterns.length * 5
      // Recursively add child specificity
      score += def.patterns.reduce((sum, p) => sum + calculateSpecificity(p), 0)
      break
    case 'anyOf':
      // Less specific - matches any
      score += 2
      break
    case 'sequence':
      // Very specific - temporal ordering
      score += 15 + def.patterns.length * 7
      score += def.patterns.reduce((sum, p) => sum + calculateSpecificity(p), 0)
      break
  }

  // Hand-specific patterns more specific than 'any'
  if (def.type === 'gesture' || def.type === 'pinch') {
    if (def.hand !== 'any') score += 5
  }

  // Applied modifiers increase specificity
  score += pattern._intent.traits.size * 2

  return score
}

// ============================================================================
// INTENT BUILDER
// ============================================================================

/**
 * Create a type-safe intent definition.
 *
 * @param config - Intent configuration
 * @returns Intent with type-safe event descriptors
 *
 * @example
 * ```ts
 * const scaleIntent = intent({
 *   id: 'transform:scale',
 *   pattern: allOf(
 *     pinch('index').withHand('right'),
 *     gesture('Closed_Fist').withHand('left')
 *   ),
 *   temporal: { minDuration: 100, maxGap: 200 },
 *   resolution: { group: 'transform', priority: 10 },
 * })
 *
 * // Subscribe to events
 * engine.on(scaleIntent.events.start, (event) => {
 *   console.log(event.position, event.hand)
 * })
 * ```
 */
export function intent<TId extends string, TPattern extends SomePatternExpr>(config: {
  id: TId
  pattern: TPattern
  temporal?: TemporalConfig
  resolution?: ResolutionConfig
}): Intent<TId, TPattern> {
  // Calculate specificity at creation time
  const specificity = calculateSpecificity(config.pattern)

  const def: IntentDef<TId, TPattern> = {
    id: config.id,
    pattern: config.pattern,
    temporal: config.temporal,
    resolution: {
      ...config.resolution,
      _specificity: specificity,
    },
  }

  // Create event descriptors
  const events = createEventDescriptors<TId>(config.id)

  // Build the intent object
  const intentObj: Intent<TId, TPattern> = {
    _intent: { def },
    id: config.id,
    pattern: config.pattern,
    temporal: config.temporal,
    resolution: def.resolution,
    events,
  }

  return intentObj
}

// ============================================================================
// EVENT DESCRIPTOR FACTORY
// ============================================================================

/**
 * Create type-safe event descriptors for an intent.
 */
function createEventDescriptors<TId extends string>(id: TId): {
  start: IntentEventDescriptor<StandardStartEvent<TId>>
  update: IntentEventDescriptor<StandardUpdateEvent<TId>>
  end: IntentEventDescriptor<StandardEndEvent<TId>>
  all: IntentEventDescriptor<
    StandardStartEvent<TId> | StandardUpdateEvent<TId> | StandardEndEvent<TId>
  >
} {
  return {
    start: {
      type: `${id}:start`,
      _event: undefined as unknown as StandardStartEvent<TId>,
    },
    update: {
      type: `${id}:update`,
      _event: undefined as unknown as StandardUpdateEvent<TId>,
    },
    end: {
      type: `${id}:end`,
      _event: undefined as unknown as StandardEndEvent<TId>,
    },
    all: {
      type: id,
      _event: undefined as unknown as
        | StandardStartEvent<TId>
        | StandardUpdateEvent<TId>
        | StandardEndEvent<TId>,
    },
  }
}

// ============================================================================
// INTENT TYPE UTILITIES
// ============================================================================

/**
 * Check if a value is an Intent.
 */
export function isIntent(value: unknown): value is Intent {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_intent' in value &&
    'id' in value &&
    'pattern' in value &&
    'events' in value
  )
}

/**
 * Extract the raw definition from an intent (for engine processing).
 */
export function getIntentDef<T extends Intent>(
  intentObj: T
): T['_intent']['def'] {
  return intentObj._intent.def
}

/**
 * Get all event type strings for an intent.
 */
export function getEventTypes(intentObj: Intent): {
  start: string
  update: string
  end: string
  all: string
} {
  return {
    start: intentObj.events.start.type,
    update: intentObj.events.update.type,
    end: intentObj.events.end.type,
    all: intentObj.events.all.type,
  }
}

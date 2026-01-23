/**
 * Intent DSL v2 - Pattern Expression Builders
 *
 * Fluent builders for creating composable gesture patterns.
 * Follows Zod's architecture: immutable cloning with merged definitions.
 *
 * Usage:
 *   const leftFist = gesture('Closed_Fist').withHand('left')
 *   const rightPinch = pinch('index').withHand('right').withThreshold(0.06)
 *   const either = anyOf(leftFist, rightPinch)
 *   const both = allOf(leftFist, rightPinch)
 */

import { getGestureThreshold, getPinchThreshold } from '@handwave/intent-engine'
import type {
  CompositePatternDef,
  FingerName,
  GestureExpr,
  GestureName,
  GesturePatternDef,
  HandIdentifier,
  PatternDef,
  PatternExpr,
  PatternExprInternals,
  PinchExpr,
  PinchPatternDef,
  SequencePatternDef,
} from './types'

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Clone a pattern expression with merged definition.
 * This is the core immutability pattern from Zod.
 */
function clonePattern<TDef extends PatternDef>(
  source: PatternExpr<TDef>,
  newDef: Partial<TDef>
): PatternExpr<TDef> {
  const mergedDef = { ...source._intent.def, ...newDef } as TDef
  const newTraits = new Set(source._intent.traits)

  // Track which modifier was applied
  for (const key of Object.keys(newDef)) {
    newTraits.add(`with${key.charAt(0).toUpperCase()}${key.slice(1)}`)
  }

  // Preserve isPrimary flag when cloning
  const isPrimary = source._intent.isPrimary

  return createPatternExpr(mergedDef, newTraits, isPrimary)
}

/**
 * Create the base pattern expression object with all methods.
 */
function createPatternExpr<TDef extends PatternDef>(
  def: TDef,
  traits: Set<string> = new Set(),
  isPrimary?: boolean
): PatternExpr<TDef> {
  const internals: PatternExprInternals<TDef> = {
    def,
    traits,
    bag: extractBag(def),
    isPrimary,
  }

  const expr: PatternExpr<TDef> = {
    _intent: internals,

    withHand<THand extends HandIdentifier>(hand: THand) {
      return clonePattern(this, { hand } as TDef) as PatternExpr<
        TDef & { hand: THand }
      >
    },

    withConfidence(confidence: number) {
      return clonePattern(this, { confidence } as TDef)
    },

    withThreshold(threshold: number) {
      return clonePattern(this, { threshold } as TDef)
    },

    or<T extends PatternExpr>(other: T): PatternExpr<CompositePatternDef> {
      return anyOf(this, other)
    },

    and<T extends PatternExpr>(other: T): PatternExpr<CompositePatternDef> {
      return allOf(this, other)
    },

    primary() {
      // Mark this pattern as primary for position calculation
      const newInternals: PatternExprInternals<TDef> = {
        ...internals,
        isPrimary: true,
      }
      
      const newExpr = { ...expr, _intent: newInternals }
      return newExpr as PatternExpr<TDef>
    },

    withPrimary(index: number) {
      // Legacy API - only applicable for composite patterns
      if (def.type === 'allOf' || def.type === 'anyOf' || def.type === 'sequence') {
        return clonePattern(this, { primaryIndex: index } as TDef)
      }
      // For non-composite patterns, this is a no-op (return self)
      return this
    },
  }

  return expr
}

/**
 * Extract bag metadata from definition.
 */
function extractBag(def: PatternDef): PatternExprInternals['bag'] {
  const bag: PatternExprInternals['bag'] = {}

  if ('hand' in def && def.hand !== 'any') {
    bag.hand = def.hand
  }

  if ('confidence' in def) {
    bag.confidence = def.confidence
  }

  if ('finger' in def) {
    bag.finger = def.finger
  }

  if ('threshold' in def) {
    bag.threshold = def.threshold
  }

  return bag
}

// ============================================================================
// GESTURE PATTERN BUILDER
// ============================================================================

/**
 * Create a gesture pattern expression.
 *
 * @param gestureName - The MediaPipe gesture name
 * @returns A fluent gesture expression
 *
 * @example
 * ```ts
 * const fist = gesture('Closed_Fist')
 * const leftFist = gesture('Closed_Fist').withHand('left')
 * const confidentFist = gesture('Closed_Fist').withConfidence(0.9)
 * ```
 */
export function gesture<TGesture extends GestureName>(
  gestureName: TGesture
): GestureExpr<GesturePatternDef & { gesture: TGesture }> {
  // Use calibrated threshold for this gesture, fallback to 0.7
  const calibratedConfidence = getGestureThreshold(gestureName, 'recommended')

  const def: GesturePatternDef = {
    type: 'gesture',
    gesture: gestureName,
    hand: 'any',
    confidence: calibratedConfidence,
  }

  const expr = createPatternExpr(def) as GestureExpr<
    GesturePatternDef & { gesture: TGesture }
  >
  return expr
}

// ============================================================================
// PINCH PATTERN BUILDER
// ============================================================================

/**
 * Create a pinch pattern expression.
 *
 * Uses calibrated per-finger thresholds by default:
 * - index: 0.06 (most reliable)
 * - middle: 0.055 (good precision)
 * - ring: 0.09 (needs loose threshold due to high variance)
 * - pinky: 0.075 (limited range of motion)
 *
 * @param finger - Which finger pinches to thumb
 * @returns A fluent pinch expression
 *
 * @example
 * ```ts
 * const indexPinch = pinch('index')           // Uses calibrated 0.06 threshold
 * const leftPinch = pinch('index').withHand('left')
 * const precisePinch = pinch('index').withThreshold(0.04)  // Override threshold
 * ```
 */
export function pinch<TFinger extends FingerName>(
  finger: TFinger
): PinchExpr<PinchPatternDef & { finger: TFinger }> {
  // Use calibrated threshold for this finger
  const calibratedThreshold = getPinchThreshold(finger)

  const def: PinchPatternDef = {
    type: 'pinch',
    finger,
    hand: 'any',
    threshold: calibratedThreshold,
  }

  // Create base expression
  const baseExpr = createPatternExpr(def)

  // Add pinch-specific methods
  const pinchExpr: PinchExpr<PinchPatternDef & { finger: TFinger }> = {
    ...baseExpr,

    withThreshold(threshold: number) {
      return clonePattern(this, { threshold } as Partial<PinchPatternDef>) as PinchExpr<
        PinchPatternDef & { finger: TFinger }
      >
    },
  } as PinchExpr<PinchPatternDef & { finger: TFinger }>

  return pinchExpr
}

// ============================================================================
// COMPOSITE PATTERN BUILDERS
// ============================================================================

/**
 * Create an anyOf composite pattern (OR logic).
 * At least one of the patterns must match.
 *
 * @param patterns - Patterns to combine
 * @returns A composite pattern expression
 *
 * @example
 * ```ts
 * const eitherFist = anyOf(
 *   gesture('Closed_Fist').withHand('left'),
 *   gesture('Closed_Fist').withHand('right')
 * )
 * ```
 */
export function anyOf<T extends Array<PatternExpr>>(
  ...patterns: T
): CompositeExpr {
  const def: CompositePatternDef = {
    type: 'anyOf',
    patterns: patterns,
  }

  const baseExpr = createPatternExpr(def)

  // Add composite-specific methods
  const compositeExpr = {
    ...baseExpr,
    withPrimary(index: number): CompositeExpr {
      const newDef: CompositePatternDef = {
        ...def,
        primaryIndex: index,
      }
      return anyOf(...newDef.patterns)
    },
  } as CompositeExpr

  return compositeExpr
}

/**
 * Create an allOf composite pattern (AND logic).
 * All patterns must match simultaneously.
 *
 * @param patterns - Patterns to combine
 * @returns A composite pattern expression
 *
 * @example
 * ```ts
 * const bothPinches = allOf(
 *   pinch('index').withHand('left'),
 *   pinch('index').withHand('right')
 * )
 * ```
 */
export function allOf<T extends Array<PatternExpr>>(
  ...patterns: T
): CompositeExpr {
  const def: CompositePatternDef = {
    type: 'allOf',
    patterns: patterns,
  }

  const baseExpr = createPatternExpr(def)

  // Add composite-specific methods
  const compositeExpr = {
    ...baseExpr,
    withPrimary(index: number): CompositeExpr {
      const newDef: CompositePatternDef = {
        ...def,
        primaryIndex: index,
      }
      return allOf(...newDef.patterns)
    },
  } as CompositeExpr

  return compositeExpr
}

/**
 * Create a sequence pattern.
 * Patterns must match in a specific temporal relationship.
 *
 * @param patterns - Patterns in sequence
 * @returns A sequence pattern expression
 *
 * @example
 * ```ts
 * // Concurrent mode (default): both hands at same time
 * const twoHanded = sequence(
 *   pinch('index').withHand('left'),
 *   gesture('Pointing_Up').withHand('right')
 * )
 *
 * // Sequential mode: one after another
 * const sequential = sequence(
 *   pinch('index').withHand('left'),
 *   gesture('Pointing_Up').withHand('right')
 * ).withMode('sequential').within(500)
 * ```
 */
export function sequence<T extends Array<PatternExpr>>(
  ...patterns: T
): SequenceExpr {
  const def: SequencePatternDef = {
    type: 'sequence',
    patterns: patterns,
    mode: 'concurrent', // Default to concurrent (like old modifiers+action)
  }

  const baseExpr = createPatternExpr(def)

  // Add sequence-specific methods
  const seqExpr = {
    ...baseExpr,
    withMode(mode: 'sequential' | 'concurrent'): SequenceExpr {
      const newDef: SequencePatternDef = {
        ...def,
        mode,
      }
      return createPatternExpr(newDef) as SequenceExpr
    },
    within(ms: number): SequenceExpr {
      const newDef: SequencePatternDef = {
        ...def,
        within: ms,
      }
      return createPatternExpr(newDef) as SequenceExpr
    },
    withPrimary(index: number): SequenceExpr {
      const newDef: SequencePatternDef = {
        ...def,
        primaryIndex: index,
      }
      return createPatternExpr(newDef) as SequenceExpr
    },
  } as SequenceExpr

  return seqExpr
}

/** Composite expression type with additional methods */
export interface CompositeExpr extends PatternExpr<CompositePatternDef> {
  primary: () => CompositeExpr
  withPrimary: (index: number) => CompositeExpr
}

/** Sequence expression type with additional methods */
export interface SequenceExpr extends PatternExpr<SequencePatternDef> {
  withMode: (mode: 'sequential' | 'concurrent') => SequenceExpr
  within: (ms: number) => SequenceExpr
  primary: () => SequenceExpr
  withPrimary: (index: number) => SequenceExpr
}

// ============================================================================
// PRE-BUILT GESTURE EXPRESSIONS (convenience)
// ============================================================================

/**
 * Pre-built gesture expressions for common MediaPipe gestures.
 * Use these directly or as starting points for customization.
 */
export const gestures = {
  closedFist: gesture('Closed_Fist'),
  openPalm: gesture('Open_Palm'),
  pointingUp: gesture('Pointing_Up'),
  thumbUp: gesture('Thumb_Up'),
  thumbDown: gesture('Thumb_Down'),
  victory: gesture('Victory'),
  iLoveYou: gesture('ILoveYou'),
} as const

/**
 * Pre-built pinch expressions for common finger combinations.
 */
export const pinches = {
  index: pinch('index'),
  middle: pinch('middle'),
  ring: pinch('ring'),
  pinky: pinch('pinky'),
} as const

// ============================================================================
// BIDIRECTIONAL TWO-HAND PATTERN HELPER
// ============================================================================

/**
 * Create a bidirectional two-hand pattern.
 * Matches if EITHER:
 * - modifierHand has modifier pattern AND actionHand has action pattern, OR
 * - modifierHand has action pattern AND actionHand has modifier pattern
 * 
 * The primary pattern (for position) is always the action pattern.
 * 
 * @example
 * ```ts
 * // Left pinch + Right point, OR Right pinch + Left point
 * bidirectional(
 *   pinches.index,      // modifier
 *   gestures.pointingUp // action (primary for position)
 * )
 * ```
 */
export function bidirectional(
  modifierPattern: PatternExpr,
  actionPattern: PatternExpr
): PatternExpr<CompositePatternDef> {
  // Create both directional patterns
  // The action pattern is marked as .primary() so extraction uses the correct hand
  const rightActionPrimary = actionPattern.primary().withHand('right')
  const leftActionPrimary = actionPattern.primary().withHand('left')
  
  const leftModifierRightAction = allOf(
    modifierPattern.withHand('left'),
    rightActionPrimary
  )
  
  const rightModifierLeftAction = allOf(
    modifierPattern.withHand('right'),
    leftActionPrimary
  )
  
  // Use anyOf to match either direction
  return anyOf(leftModifierRightAction, rightModifierLeftAction)
}

/**
 * Pattern Matching Tests for DSL v2
 *
 * Tests the runtime pattern matching logic with real fixture data.
 * Progressively tests from simple to complex patterns.
 */

import { describe, test, expect } from 'vitest'
import {
  victoryRightFrames,
  victoryLeftFrames,
  leftIndexPinchFrames,
  rightIndexPinchFrames,
} from '@/core/lib/intent/__fixtures__'
import type { FrameSnapshot } from '@/core/lib/intent/core/types'
import { matchPatternExpr, extractMatchedHandFromPattern } from '../matching'
import { gestures, pinches, anyOf, allOf, bidirectional } from '../patterns'

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Merge hands from two different frames into a single frame.
 * This lets us create two-hand test scenarios from single-hand fixtures.
 * 
 * Note: Fixtures are labeled opposite - 'left-xxx' files have Right handedness.
 * We extract the primary hand (hand[0]) from each fixture and relabel them.
 */
function mergeTwoHandFrame(
  leftHandFrame: any,
  rightHandFrame: any
): FrameSnapshot {
  // Get the primary hand from each fixture (hand[0])
  const leftHand = leftHandFrame.gestureResult.hands[0]
  const rightHand = rightHandFrame.gestureResult.hands[0]

  // Relabel hands to match the actual hand we want
  const leftHandRelabeled = leftHand ? { ...leftHand, handedness: 'Left', handIndex: 0 } : null
  const rightHandRelabeled = rightHand ? { ...rightHand, handedness: 'Right', handIndex: 1 } : null

  const hands = [leftHandRelabeled, rightHandRelabeled].filter(Boolean)

  return {
    timestamp: leftHandFrame.timestamp,
    gestureResult: {
      hands,
    },
    faceResult: null,
  } as FrameSnapshot
}

/**
 * Get first frame from fixture and cast to FrameSnapshot
 */
function getFrame(fixture: any): FrameSnapshot {
  return fixture.frames[0] as unknown as FrameSnapshot
}

// ============================================================================
// LEVEL 1: Simple Single-Hand Patterns
// ============================================================================

describe('Level 1: Simple Gesture Patterns', () => {
  test('matches victory gesture (fixture has both hands)', () => {
    const frame = getFrame(victoryRightFrames)
    // Fixture has both hands, hand[0] is Right, hand[1] is Left
    const patternRight = gestures.victory.withHand('right')
    const patternLeft = gestures.victory.withHand('left')

    expect(matchPatternExpr(frame, patternRight)).toBe(true)
    expect(matchPatternExpr(frame, patternLeft)).toBe(true) // Both hands have victory
  })

  test('does not match wrong gesture', () => {
    const frame = getFrame(victoryRightFrames)
    const pattern = gestures.closedFist.withHand('right')

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(false)
  })
})

describe('Level 1: Simple Pinch Patterns', () => {
  test('matches index pinch (fixture has both hands)', () => {
    const frame = getFrame(leftIndexPinchFrames)
    // Fixture has both hands with None gesture (pinch active)
    const patternRight = pinches.index.withHand('right')
    const patternLeft = pinches.index.withHand('left')

    expect(matchPatternExpr(frame, patternRight)).toBe(true)
    expect(matchPatternExpr(frame, patternLeft)).toBe(true) // Both hands can pinch
  })
})

// ============================================================================
// LEVEL 2: anyOf Patterns (OR Logic)
// ============================================================================

describe('Level 2: anyOf Patterns - Same Hand', () => {
  test('matches first option in anyOf', () => {
    const frame = getFrame(victoryRightFrames)
    const pattern = anyOf(
      gestures.victory.withHand('right'),
      gestures.closedFist.withHand('right')
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(true)
  })

  test('matches second option in anyOf', () => {
    const frame = getFrame(victoryRightFrames)
    const pattern = anyOf(
      gestures.closedFist.withHand('right'),
      gestures.victory.withHand('right')
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(true)
  })

  test('does not match if no options match', () => {
    const frame = getFrame(victoryRightFrames)
    const pattern = anyOf(
      gestures.closedFist.withHand('right'),
      gestures.openPalm.withHand('right')
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(false)
  })
})

describe('Level 2: anyOf Patterns - Different Hands', () => {
  test('matches left hand in anyOf', () => {
    const frame = getFrame(victoryLeftFrames)
    const pattern = anyOf(
      gestures.victory.withHand('left'),
      gestures.victory.withHand('right')
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(true)
  })

  test('matches right hand in anyOf', () => {
    const frame = getFrame(victoryRightFrames)
    const pattern = anyOf(
      gestures.victory.withHand('left'),
      gestures.victory.withHand('right')
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(true)
  })
})

// ============================================================================
// LEVEL 3: allOf Patterns (AND Logic) - Two Hands Required
// ============================================================================

describe('Level 3: allOf Patterns - Two Hands', () => {
  test('matches when both hands present with correct gestures', () => {
    const frame = mergeTwoHandFrame(
      getFrame(leftIndexPinchFrames),
      getFrame(victoryRightFrames)
    )

    const pattern = allOf(
      pinches.index.withHand('left'),
      gestures.victory.withHand('right')
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(true)
  })

  test('does not match when only one hand present', () => {
    const frame = getFrame(victoryRightFrames)
    const pattern = allOf(
      pinches.index.withHand('left'),
      gestures.victory.withHand('right')
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(false)
  })

  test('does not match when gestures are swapped', () => {
    const frame = mergeTwoHandFrame(
      getFrame(leftIndexPinchFrames),
      getFrame(victoryRightFrames)
    )

    const pattern = allOf(
      gestures.victory.withHand('left'), // Wrong - left has pinch
      pinches.index.withHand('right')    // Wrong - right has victory
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(false)
  })
})

// ============================================================================
// LEVEL 4: Nested Composite - anyOf(allOf(...))
// ============================================================================

describe('Level 4: Nested Composite Patterns', () => {
  test('matches first branch of anyOf(allOf)', () => {
    const frame = mergeTwoHandFrame(
      getFrame(leftIndexPinchFrames),
      getFrame(victoryRightFrames)
    )

    const pattern = anyOf(
      allOf(
        pinches.index.withHand('left'),
        gestures.victory.withHand('right')
      ),
      allOf(
        pinches.index.withHand('right'),
        gestures.victory.withHand('left')
      )
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(true)
  })

  test('matches second branch of anyOf(allOf)', () => {
    const frame = mergeTwoHandFrame(
      getFrame(victoryLeftFrames),
      getFrame(rightIndexPinchFrames)
    )

    const pattern = anyOf(
      allOf(
        pinches.index.withHand('left'),
        gestures.victory.withHand('right')
      ),
      allOf(
        pinches.index.withHand('right'),
        gestures.victory.withHand('left')
      )
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(true)
  })

  test('does not match if neither branch matches', () => {
    const frame = mergeTwoHandFrame(
      getFrame(victoryLeftFrames),
      getFrame(victoryRightFrames)
    )

    const pattern = anyOf(
      allOf(
        pinches.index.withHand('left'),
        gestures.victory.withHand('right')
      ),
      allOf(
        pinches.index.withHand('right'),
        gestures.victory.withHand('left')
      )
    )

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(false)
  })
})

// ============================================================================
// LEVEL 5: Bidirectional Helper
// ============================================================================

describe('Level 5: bidirectional() Helper', () => {
  test('matches left trigger + right action', () => {
    const frame = mergeTwoHandFrame(
      getFrame(leftIndexPinchFrames),
      getFrame(victoryRightFrames)
    )

    const pattern = bidirectional(pinches.index, gestures.victory)

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(true)
  })

  test('matches right trigger + left action', () => {
    const frame = mergeTwoHandFrame(
      getFrame(victoryLeftFrames),
      getFrame(rightIndexPinchFrames)
    )

    const pattern = bidirectional(pinches.index, gestures.victory)

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(true)
  })

  test('does not match when both hands have same gesture', () => {
    const frame = mergeTwoHandFrame(
      getFrame(victoryLeftFrames),
      getFrame(victoryRightFrames)
    )

    const pattern = bidirectional(pinches.index, gestures.victory)

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(false)
  })

  test('does not match when only one hand present', () => {
    const frame = getFrame(victoryRightFrames)
    const pattern = bidirectional(pinches.index, gestures.victory)

    const matches = matchPatternExpr(frame, pattern)
    expect(matches).toBe(false)
  })
})

// ============================================================================
// LEVEL 6: Pattern Extraction - Finding Primary Hand
// ============================================================================

describe('Level 6: Pattern Extraction with .primary()', () => {
  test('extracts correct hand from bidirectional pattern - left trigger, right action', () => {
    const frame = mergeTwoHandFrame(
      getFrame(leftIndexPinchFrames),
      getFrame(victoryRightFrames)
    )

    const pattern = bidirectional(pinches.index, gestures.victory)
    const extracted = extractMatchedHandFromPattern(frame, pattern)

    expect(extracted).not.toBeNull()
    expect(extracted!.hand).toBe('right') // Action hand is right
  })

  test('extracts correct hand from bidirectional pattern - right trigger, left action', () => {
    const frame = mergeTwoHandFrame(
      getFrame(victoryLeftFrames),
      getFrame(rightIndexPinchFrames)
    )

    const pattern = bidirectional(pinches.index, gestures.victory)
    const extracted = extractMatchedHandFromPattern(frame, pattern)

    expect(extracted).not.toBeNull()
    expect(extracted!.hand).toBe('left') // Action hand is left
  })

  test('extracts position from primary pattern', () => {
    const frame = mergeTwoHandFrame(
      getFrame(leftIndexPinchFrames),
      getFrame(victoryRightFrames)
    )

    const pattern = bidirectional(pinches.index, gestures.victory)
    const extracted = extractMatchedHandFromPattern(frame, pattern)

    expect(extracted).not.toBeNull()
    expect(extracted!.position).toBeDefined()
    expect(extracted!.position.x).toBeTypeOf('number')
    expect(extracted!.position.y).toBeTypeOf('number')
    expect(extracted!.position.z).toBeTypeOf('number')
  })
})

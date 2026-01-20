/**
 * Per-Hand Intent Instance Tests
 *
 * Tests for the refactored intent engine that supports multiple hands
 * performing the same intent simultaneously.
 */

import { describe, test, expect } from 'vitest'
import { extractAllMatchingHands } from '../matching'
import { gestures, pinches, bidirectional } from '../patterns'
import { intent } from '../intent'
import { processFrameV2 } from '../engine'
import type { FrameSnapshot } from '@/core/lib/intent/core/types'
import type { ConflictResolutionConfig } from '../engine'

// Test helper to create a two-hand frame
function createTwoHandFrame(
  leftGesture: string,
  leftScore: number,
  rightGesture: string,
  rightScore: number,
  timestamp = Date.now()
): FrameSnapshot {
  return {
    timestamp,
    faceResult: null,
    gestureResult: {
      hands: [
        {
          handedness: 'left',
          handIndex: 0,
          headIndex: 0,
          gesture: leftGesture,
          gestureScore: leftScore,
          landmarks: Array.from({ length: 21 }, (_, i) => ({
            x: 0.3 + i * 0.01,
            y: 0.5,
            z: 0,
            visibility: 1,
          })),
        },
        {
          handedness: 'right',
          handIndex: 1,
          headIndex: 0,
          gesture: rightGesture,
          gestureScore: rightScore,
          landmarks: Array.from({ length: 21 }, (_, i) => ({
            x: 0.7 + i * 0.01,
            y: 0.5,
            z: 0,
            visibility: 1,
          })),
        },
      ],
    },
  }
}

describe('extractAllMatchingHands', () => {
  test('returns all hands for any-hand pattern', () => {
    const frame = createTwoHandFrame('Pointing_Up', 0.9, 'Pointing_Up', 0.9)
    const pattern = gestures.pointingUp.withHand('any').primary()

    const hands = extractAllMatchingHands(frame, pattern)

    expect(hands).toHaveLength(2)
    expect(hands[0].hand).toBe('left')
    expect(hands[0].handIndex).toBe(0)
    expect(hands[0].headIndex).toBe(0)
    expect(hands[1].hand).toBe('right')
    expect(hands[1].handIndex).toBe(1)
    expect(hands[1].headIndex).toBe(0)
  })

  test('returns only left hand for left-specific pattern', () => {
    const frame = createTwoHandFrame('Pointing_Up', 0.9, 'Pointing_Up', 0.9)
    const pattern = gestures.pointingUp.withHand('left').primary()

    const hands = extractAllMatchingHands(frame, pattern)

    expect(hands).toHaveLength(1)
    expect(hands[0].hand).toBe('left')
  })

  test('returns only right hand for right-specific pattern', () => {
    const frame = createTwoHandFrame('Pointing_Up', 0.9, 'Pointing_Up', 0.9)
    const pattern = gestures.pointingUp.withHand('right').primary()

    const hands = extractAllMatchingHands(frame, pattern)

    expect(hands).toHaveLength(1)
    expect(hands[0].hand).toBe('right')
  })

  test('returns empty array when no hands match', () => {
    const frame = createTwoHandFrame('Closed_Fist', 0.9, 'Closed_Fist', 0.9)
    const pattern = gestures.pointingUp.withHand('any').primary()

    const hands = extractAllMatchingHands(frame, pattern)

    expect(hands).toHaveLength(0)
  })

  test('returns only matching hands when gestures differ', () => {
    const frame = createTwoHandFrame('Pointing_Up', 0.9, 'Closed_Fist', 0.9)
    const pattern = gestures.pointingUp.withHand('any').primary()

    const hands = extractAllMatchingHands(frame, pattern)

    expect(hands).toHaveLength(1)
    expect(hands[0].hand).toBe('left')
  })

  test('returns single primary hand for bidirectional pattern', () => {
    // Left pointing, right closed fist
    const frame = createTwoHandFrame('Pointing_Up', 0.9, 'Closed_Fist', 0.9)
    const pattern = bidirectional(
      gestures.closedFist,
      gestures.pointingUp
    )

    const hands = extractAllMatchingHands(frame, pattern)

    // Should return only the primary (pointing) hand
    expect(hands).toHaveLength(1)
    expect(hands[0].hand).toBe('left')
  })

  test('includes position data for all matched hands', () => {
    const frame = createTwoHandFrame('Pointing_Up', 0.9, 'Pointing_Up', 0.9)
    const pattern = gestures.pointingUp.withHand('any').primary()

    const hands = extractAllMatchingHands(frame, pattern)

    expect(hands).toHaveLength(2)
    expect(hands[0].position).toBeDefined()
    expect(hands[0].position.x).toBeTypeOf('number')
    expect(hands[0].position.y).toBeTypeOf('number')
    expect(hands[1].position).toBeDefined()
  })
})

describe('Per-hand intent instances', () => {
  const config: ConflictResolutionConfig = {
    intents: [],
    historySize: 30,
    spatial: { grid: { cols: 8, rows: 6 }, hysteresis: { threshold: 0.1 } },
    temporal: { defaultMinDuration: 100, defaultMaxGap: 200 },
    maxConcurrentIntents: Infinity,
    groupLimits: {
      spawn: { max: 2, strategy: 'top-k' },
    },
  }

  test('allows both hands to spawn particles simultaneously', () => {
    const testIntent = intent({
      id: 'test:spawn',
      pattern: gestures.pointingUp.withHand('any').primary(),
      resolution: { group: 'spawn' },
    })

    const frame = createTwoHandFrame('Pointing_Up', 0.9, 'Pointing_Up', 0.9)

    const result = processFrameV2(frame, [], [testIntent], new Map(), config)

    // Should create 2 start events (one per hand)
    expect(result.events).toHaveLength(2)
    expect(result.events[0].type).toBe('test:spawn:start')
    expect(result.events[1].type).toBe('test:spawn:start')
    expect(result.events[0].hand).toBe('left')
    expect(result.events[1].hand).toBe('right')

    // Should have 2 active actions
    expect(result.actions.size).toBe(2)
  })

  test('respects group limits across hands', () => {
    const testIntent = intent({
      id: 'test:spawn',
      pattern: gestures.pointingUp.withHand('any').primary(),
      resolution: { group: 'spawn' },
    })

    const limitedConfig = {
      ...config,
      groupLimits: {
        spawn: { max: 1, strategy: 'winner-takes-all' as const },
      },
    }

    const frame = createTwoHandFrame('Pointing_Up', 0.9, 'Pointing_Up', 0.9)

    const result = processFrameV2(frame, [], [testIntent], new Map(), limitedConfig)

    // Should only create 1 start event (group limit of 1)
    expect(result.events).toHaveLength(1)
    expect(result.actions.size).toBe(1)
  })

  test('tracks actions per hand independently', () => {
    const testIntent = intent({
      id: 'test:spawn',
      pattern: gestures.pointingUp.withHand('any').primary(),
      resolution: { group: 'spawn' },
    })

    // Frame 1: Left hand pointing
    const frame1 = createTwoHandFrame('Pointing_Up', 0.9, 'None', 0, 1000)
    const result1 = processFrameV2(frame1, [], [testIntent], new Map(), config)

    expect(result1.events).toHaveLength(1)
    expect(result1.events[0].hand).toBe('left')

    // Frame 2: Both hands pointing
    const frame2 = createTwoHandFrame('Pointing_Up', 0.9, 'Pointing_Up', 0.9, 1100)
    const result2 = processFrameV2(frame2, [frame1], [testIntent], result1.actions, config)

    // Should have 1 update (left) + 1 start (right)
    expect(result2.events).toHaveLength(2)
    const updateEvent = result2.events.find(e => e.type === 'test:spawn:update')
    const startEvent = result2.events.find(e => e.type === 'test:spawn:start')

    expect(updateEvent).toBeDefined()
    expect(updateEvent?.hand).toBe('left')
    expect(startEvent).toBeDefined()
    expect(startEvent?.hand).toBe('right')

    expect(result2.actions.size).toBe(2)
  })

  test('includes headIndex in events', () => {
    const testIntent = intent({
      id: 'test:spawn',
      pattern: gestures.pointingUp.withHand('any').primary(),
      resolution: { group: 'spawn' },
    })

    const frame = createTwoHandFrame('Pointing_Up', 0.9, 'None', 0)

    const result = processFrameV2(frame, [], [testIntent], new Map(), config)

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toHaveProperty('headIndex')
    expect(result.events[0].headIndex).toBe(0)
  })

  test('ends action when specific hand stops matching', () => {
    const testIntent = intent({
      id: 'test:spawn',
      pattern: gestures.pointingUp.withHand('any').primary(),
      resolution: { group: 'spawn' },
    })

    // Frame 1: Both hands pointing
    const frame1 = createTwoHandFrame('Pointing_Up', 0.9, 'Pointing_Up', 0.9, 1000)
    const result1 = processFrameV2(frame1, [], [testIntent], new Map(), config)

    expect(result1.actions.size).toBe(2)

    // Frame 2: Only left hand pointing (right hand stops)
    const frame2 = createTwoHandFrame('Pointing_Up', 0.9, 'None', 0, 1100)
    const result2 = processFrameV2(frame2, [frame1], [testIntent], result1.actions, config)

    // Should have 1 update (left continues) + 1 end (right stops)
    expect(result2.events).toHaveLength(2)
    const updateEvent = result2.events.find(e => e.type === 'test:spawn:update')
    const endEvent = result2.events.find(e => e.type === 'test:spawn:end')

    expect(updateEvent).toBeDefined()
    expect(updateEvent?.hand).toBe('left')
    expect(endEvent).toBeDefined()
    expect(endEvent?.hand).toBe('right')

    // Only left hand action remains
    expect(result2.actions.size).toBe(1)
  })
})

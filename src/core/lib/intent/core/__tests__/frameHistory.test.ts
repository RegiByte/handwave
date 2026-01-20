/**
 * Frame History Tests
 *
 * Tests for frame history ring buffer and temporal query functions.
 * Uses real fixture data to validate behavior.
 */

import { victoryRightFrames } from '@/core/lib/intent/__fixtures__'
import type { FrameSnapshot, Vector3 } from '@/core/lib/intent/core/types'
import {
  addFrame,
  calculateAverageVelocity,
  calculateVelocity,
  checkAnyInWindow,
  checkHeldFor,
  getAverageFPS,
  getContinuousDuration,
  getFrameAgo,
  getFramesInWindow,
  getHistoryDuration,
  getLatestFrame,
} from '@/core/lib/intent/core/frameHistory'

// ============================================================================
// Test Data Setup
// ============================================================================

// Convert fixture frames to FrameSnapshot type
const fixtureFrames = victoryRightFrames.frames.map(
  (f) => f as unknown as FrameSnapshot
)

// Helper: Create a simple frame with timestamp
function createFrame(timestamp: number): FrameSnapshot {
  return {
    timestamp,
    faceResult: null,
    gestureResult: {
      hands: [
        {
          handedness: 'Right',
          handIndex: 0,
          gesture: 'Victory',
          gestureScore: 0.9,
          landmarks: Array.from({ length: 21 }, (_, i) => ({
            x: 0.5 + i * 0.01,
            y: 0.5 + i * 0.01,
            z: 0,
            visibility: 1,
          })),
        },
      ],
    },
  }
}

// Helper: Extract index fingertip (landmark 8) from frame
function getIndexTip(frame: FrameSnapshot): Vector3 | null {
  const hand = frame.gestureResult?.hands[0]
  if (!hand || !hand.landmarks || hand.landmarks.length < 9) return null
  const landmark = hand.landmarks[8]
  return { x: landmark.x, y: landmark.y, z: landmark.z }
}

// Helper: Check if Victory gesture is present
function hasVictory(frame: FrameSnapshot): boolean {
  return (
    frame.gestureResult?.hands.some((h) => h.gesture === 'Victory') ?? false
  )
}

// Helper: Check if any hand is present
function hasHands(frame: FrameSnapshot): boolean {
  return (frame.gestureResult?.hands.length ?? 0) > 0
}

// ============================================================================
// Ring Buffer Management Tests
// ============================================================================

describe('Frame History - Ring Buffer', () => {
  describe('addFrame', () => {
    test('adds frame to empty buffer', () => {
      const frames: Array<FrameSnapshot> = []
      const newFrame = createFrame(1000)

      const result = addFrame(frames, newFrame, 10)

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(newFrame)
    })

    test('adds frames up to max size', () => {
      let frames: Array<FrameSnapshot> = []

      for (let i = 0; i < 5; i++) {
        frames = addFrame(frames, createFrame(1000 + i * 100), 10)
      }

      expect(frames).toHaveLength(5)
      expect(frames[0].timestamp).toBe(1000)
      expect(frames[4].timestamp).toBe(1400)
    })

    test('removes oldest frame when exceeding max size', () => {
      let frames: Array<FrameSnapshot> = []

      // Add 12 frames with max size of 10
      for (let i = 0; i < 12; i++) {
        frames = addFrame(frames, createFrame(1000 + i * 100), 10)
      }

      expect(frames).toHaveLength(10)
      // Should have removed first 2 frames
      expect(frames[0].timestamp).toBe(1200) // 3rd frame
      expect(frames[9].timestamp).toBe(2100) // 12th frame
    })

    test('maintains immutability (does not mutate input)', () => {
      const original: Array<FrameSnapshot> = [createFrame(1000)]
      const newFrame = createFrame(2000)

      const result = addFrame(original, newFrame, 10)

      expect(original).toHaveLength(1)
      expect(result).toHaveLength(2)
      expect(original).not.toBe(result)
    })
  })

  describe('getLatestFrame', () => {
    test('returns latest frame from non-empty buffer', () => {
      const frames = [createFrame(1000), createFrame(2000), createFrame(3000)]

      const latest = getLatestFrame(frames)

      expect(latest).not.toBeNull()
      expect(latest?.timestamp).toBe(3000)
    })

    test('returns null for empty buffer', () => {
      const frames: Array<FrameSnapshot> = []

      const latest = getLatestFrame(frames)

      expect(latest).toBeNull()
    })
  })

  describe('getFrameAgo', () => {
    test('returns latest frame when n=0', () => {
      const frames = [createFrame(1000), createFrame(2000), createFrame(3000)]

      const frame = getFrameAgo(frames, 0)

      expect(frame).not.toBeNull()
      expect(frame?.timestamp).toBe(3000)
    })

    test('returns previous frame when n=1', () => {
      const frames = [createFrame(1000), createFrame(2000), createFrame(3000)]

      const frame = getFrameAgo(frames, 1)

      expect(frame).not.toBeNull()
      expect(frame?.timestamp).toBe(2000)
    })

    test('returns oldest frame when n=length-1', () => {
      const frames = [createFrame(1000), createFrame(2000), createFrame(3000)]

      const frame = getFrameAgo(frames, 2)

      expect(frame).not.toBeNull()
      expect(frame?.timestamp).toBe(1000)
    })

    test('returns null when n exceeds buffer size', () => {
      const frames = [createFrame(1000), createFrame(2000)]

      const frame = getFrameAgo(frames, 5)

      expect(frame).toBeNull()
    })

    test('returns null for empty buffer', () => {
      const frames: Array<FrameSnapshot> = []

      const frame = getFrameAgo(frames, 0)

      expect(frame).toBeNull()
    })
  })
})

// ============================================================================
// Temporal Query Tests
// ============================================================================

describe('Frame History - Temporal Queries', () => {
  describe('getFramesInWindow', () => {
    test('returns frames within time window', () => {
      const frames = [
        createFrame(1000),
        createFrame(1100),
        createFrame(1200),
        createFrame(1300),
        createFrame(1400),
      ]

      // Get frames within 250ms window (should get last 3 frames)
      const window = getFramesInWindow(frames, 250)

      expect(window).toHaveLength(3)
      expect(window[0].timestamp).toBe(1200)
      expect(window[2].timestamp).toBe(1400)
    })

    test('returns all frames when window exceeds history', () => {
      const frames = [createFrame(1000), createFrame(1100), createFrame(1200)]

      const window = getFramesInWindow(frames, 1000)

      expect(window).toHaveLength(3)
    })

    test('returns empty array for empty buffer', () => {
      const frames: Array<FrameSnapshot> = []

      const window = getFramesInWindow(frames, 500)

      expect(window).toHaveLength(0)
    })

    test('works with real fixture data', () => {
      // Victory fixture has 10 frames spanning ~400ms
      const window = getFramesInWindow(fixtureFrames, 200)

      expect(window.length).toBeGreaterThan(0)
      expect(window.length).toBeLessThanOrEqual(fixtureFrames.length)
    })
  })

  describe('checkHeldFor', () => {
    test('returns true when condition held for entire duration', () => {
      const frames = [
        createFrame(1000),
        createFrame(1100),
        createFrame(1200),
        createFrame(1300),
      ]

      // All frames have hands (from createFrame helper)
      const held = checkHeldFor(frames, 300, hasHands)

      expect(held).toBe(true)
    })

    test('returns false when condition not held continuously', () => {
      const frames = [
        createFrame(1000),
        createFrame(1100),
        { timestamp: 1200, faceResult: null, gestureResult: null }, // No hands
        createFrame(1300),
      ]

      const held = checkHeldFor(frames, 300, hasHands)

      expect(held).toBe(false)
    })

    test('returns false for empty buffer', () => {
      const frames: Array<FrameSnapshot> = []

      const held = checkHeldFor(frames, 500, hasHands)

      expect(held).toBe(false)
    })

    test('works with real fixture data (Victory gesture)', () => {
      // All fixture frames have Victory gesture
      const held = checkHeldFor(fixtureFrames, 200, hasVictory)

      expect(held).toBe(true)
    })
  })

  describe('checkAnyInWindow', () => {
    test('returns true when condition true at any point', () => {
      const frames = [
        { timestamp: 1000, faceResult: null, gestureResult: null },
        createFrame(1100), // Has hands
        { timestamp: 1200, faceResult: null, gestureResult: null },
      ]

      const any = checkAnyInWindow(frames, 300, hasHands)

      expect(any).toBe(true)
    })

    test('returns false when condition never true', () => {
      const frames = [
        { timestamp: 1000, faceResult: null, gestureResult: null },
        { timestamp: 1100, faceResult: null, gestureResult: null },
        { timestamp: 1200, faceResult: null, gestureResult: null },
      ]

      const any = checkAnyInWindow(frames, 300, hasHands)

      expect(any).toBe(false)
    })

    test('returns false for empty buffer', () => {
      const frames: Array<FrameSnapshot> = []

      const any = checkAnyInWindow(frames, 500, hasHands)

      expect(any).toBe(false)
    })
  })

  describe('getContinuousDuration', () => {
    test('calculates duration when condition continuously true', () => {
      const frames = [
        createFrame(1000),
        createFrame(1100),
        createFrame(1200),
        createFrame(1300),
      ]

      const duration = getContinuousDuration(frames, hasHands)

      expect(duration).toBe(300) // 1300 - 1000
    })

    test('returns partial duration when condition became true mid-history', () => {
      const frames = [
        { timestamp: 1000, faceResult: null, gestureResult: null },
        { timestamp: 1100, faceResult: null, gestureResult: null },
        createFrame(1200), // Condition becomes true
        createFrame(1300),
        createFrame(1400),
      ]

      const duration = getContinuousDuration(frames, hasHands)

      expect(duration).toBe(200) // 1400 - 1200
    })

    test('returns 0 when condition not currently true', () => {
      const frames = [
        createFrame(1000),
        createFrame(1100),
        { timestamp: 1200, faceResult: null, gestureResult: null }, // Latest frame fails
      ]

      const duration = getContinuousDuration(frames, hasHands)

      expect(duration).toBe(0)
    })

    test('returns 0 for empty buffer', () => {
      const frames: Array<FrameSnapshot> = []

      const duration = getContinuousDuration(frames, hasHands)

      expect(duration).toBe(0)
    })

    test('works with real fixture data', () => {
      // All fixture frames have Victory gesture
      const duration = getContinuousDuration(fixtureFrames, hasVictory)

      expect(duration).toBeGreaterThan(0)
      // Duration should be from first to last frame
      const expectedDuration =
        fixtureFrames[fixtureFrames.length - 1].timestamp -
        fixtureFrames[0].timestamp
      expect(duration).toBeCloseTo(expectedDuration, 0)
    })
  })
})

// ============================================================================
// Velocity Calculation Tests
// ============================================================================

describe('Frame History - Velocity Calculations', () => {
  describe('calculateVelocity', () => {
    test('calculates velocity between two frames', () => {
      const frame1 = createFrame(1000)
      const frame2 = createFrame(1100)

      // Get initial positions from createFrame helper
      // createFrame sets landmark[8] to x: 0.5 + 8*0.01 = 0.58
      const initialX = 0.58
      const initialY = 0.58

      // Modify landmark position for frame2
      if (frame2.gestureResult?.hands[0]?.landmarks[8]) {
        frame2.gestureResult.hands[0].landmarks[8].x = 0.6 // Moved 0.02 in x
        frame2.gestureResult.hands[0].landmarks[8].y = 0.6 // Moved 0.02 in y
      }

      const velocity = calculateVelocity(frame2, frame1, getIndexTip)

      expect(velocity).not.toBeNull()
      // Delta: 0.6 - 0.58 = 0.02, Time: 100ms = 0.1s, Velocity: 0.02/0.1 = 0.2 units/s
      expect(velocity?.x).toBeCloseTo(0.2, 1)
      expect(velocity?.y).toBeCloseTo(0.2, 1)
      expect(velocity?.z).toBe(0)
    })

    test('returns null when landmarks missing in current frame', () => {
      const frame1 = createFrame(1000)
      const frame2: FrameSnapshot = {
        timestamp: 1100,
        faceResult: null,
        gestureResult: null,
      }

      const velocity = calculateVelocity(frame2, frame1, getIndexTip)

      expect(velocity).toBeNull()
    })

    test('returns null when landmarks missing in previous frame', () => {
      const frame1: FrameSnapshot = {
        timestamp: 1000,
        faceResult: null,
        gestureResult: null,
      }
      const frame2 = createFrame(1100)

      const velocity = calculateVelocity(frame2, frame1, getIndexTip)

      expect(velocity).toBeNull()
    })

    test('returns zero velocity when time delta is zero', () => {
      const frame1 = createFrame(1000)
      const frame2 = createFrame(1000) // Same timestamp

      const velocity = calculateVelocity(frame2, frame1, getIndexTip)

      expect(velocity).not.toBeNull()
      expect(velocity?.x).toBe(0)
      expect(velocity?.y).toBe(0)
      expect(velocity?.z).toBe(0)
    })

    test('works with real fixture data', () => {
      if (fixtureFrames.length < 2) return

      const velocity = calculateVelocity(
        fixtureFrames[1],
        fixtureFrames[0],
        getIndexTip
      )

      expect(velocity).not.toBeNull()
      // Velocity should be a reasonable number (not NaN or Infinity)
      expect(Number.isFinite(velocity?.x)).toBe(true)
      expect(Number.isFinite(velocity?.y)).toBe(true)
      expect(Number.isFinite(velocity?.z)).toBe(true)
    })
  })

  describe('calculateAverageVelocity', () => {
    test('calculates average velocity over window', () => {
      const frames = [
        createFrame(1000),
        createFrame(1100),
        createFrame(1200),
        createFrame(1300),
      ]

      // Modify positions to create consistent movement
      frames.forEach((frame, i) => {
        if (frame.gestureResult?.hands[0]?.landmarks[8]) {
          frame.gestureResult.hands[0].landmarks[8].x = 0.5 + i * 0.1
        }
      })

      const avgVelocity = calculateAverageVelocity(frames, 300, getIndexTip)

      expect(avgVelocity).not.toBeNull()
      expect(avgVelocity?.x).toBeCloseTo(1.0, 1) // 0.1 / 0.1s = 1.0 units/s
    })

    test('returns null when insufficient data (< 2 frames)', () => {
      const frames = [createFrame(1000)]

      const avgVelocity = calculateAverageVelocity(frames, 500, getIndexTip)

      expect(avgVelocity).toBeNull()
    })

    test('returns null for empty buffer', () => {
      const frames: Array<FrameSnapshot> = []

      const avgVelocity = calculateAverageVelocity(frames, 500, getIndexTip)

      expect(avgVelocity).toBeNull()
    })

    test('handles frames with missing landmarks gracefully', () => {
      const frames = [
        createFrame(1000),
        { timestamp: 1100, faceResult: null, gestureResult: null }, // No landmarks
        createFrame(1200),
        createFrame(1300),
      ]

      const avgVelocity = calculateAverageVelocity(frames, 300, getIndexTip)

      // Should still calculate average from available pairs
      expect(avgVelocity).not.toBeNull()
    })

    test('works with real fixture data', () => {
      if (fixtureFrames.length < 2) return

      const avgVelocity = calculateAverageVelocity(
        fixtureFrames,
        200,
        getIndexTip
      )

      // Should return a valid velocity (may be null if window too small)
      if (avgVelocity) {
        expect(Number.isFinite(avgVelocity.x)).toBe(true)
        expect(Number.isFinite(avgVelocity.y)).toBe(true)
        expect(Number.isFinite(avgVelocity.z)).toBe(true)
      }
    })
  })
})

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Frame History - Utility Functions', () => {
  describe('getHistoryDuration', () => {
    test('calculates time span of frame history', () => {
      const frames = [createFrame(1000), createFrame(1200), createFrame(1500)]

      const duration = getHistoryDuration(frames)

      expect(duration).toBe(500) // 1500 - 1000
    })

    test('returns 0 for empty buffer', () => {
      const frames: Array<FrameSnapshot> = []

      const duration = getHistoryDuration(frames)

      expect(duration).toBe(0)
    })

    test('returns 0 for single frame', () => {
      const frames = [createFrame(1000)]

      const duration = getHistoryDuration(frames)

      expect(duration).toBe(0)
    })

    test('works with real fixture data', () => {
      const duration = getHistoryDuration(fixtureFrames)

      expect(duration).toBeGreaterThan(0)
      // Should match difference between first and last frame
      const expected =
        fixtureFrames[fixtureFrames.length - 1].timestamp -
        fixtureFrames[0].timestamp
      expect(duration).toBe(expected)
    })
  })

  describe('getAverageFPS', () => {
    test('calculates average frame rate', () => {
      const frames = [
        createFrame(1000),
        createFrame(1100),
        createFrame(1200),
        createFrame(1300),
      ]

      const fps = getAverageFPS(frames)

      // 3 intervals over 300ms = 10 FPS
      expect(fps).toBeCloseTo(10, 1)
    })

    test('returns 0 for empty buffer', () => {
      const frames: Array<FrameSnapshot> = []

      const fps = getAverageFPS(frames)

      expect(fps).toBe(0)
    })

    test('returns 0 for single frame', () => {
      const frames = [createFrame(1000)]

      const fps = getAverageFPS(frames)

      expect(fps).toBe(0)
    })

    test('returns 0 when all frames have same timestamp', () => {
      const frames = [createFrame(1000), createFrame(1000), createFrame(1000)]

      const fps = getAverageFPS(frames)

      expect(fps).toBe(0)
    })

    test('works with real fixture data', () => {
      const fps = getAverageFPS(fixtureFrames)

      expect(fps).toBeGreaterThan(0)
      // Typical frame rate should be reasonable (10-60 FPS)
      expect(fps).toBeGreaterThan(10)
      expect(fps).toBeLessThan(100)
    })
  })
})

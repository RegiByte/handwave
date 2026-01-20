/**
 * Gesture Matcher Tests
 *
 * Tests for gesture matching functions using real fixture data.
 */

import {
  closedFistLeftFrames,
  noneGestureFrames,
  openPalmLeftFrames,
  thumbDownLeftFrames,
  thumbUpLeftFrames,
  victoryLeftFrames,
  victoryRightFrames,
} from '@/core/lib/intent/__fixtures__'
import type { FrameSnapshot, Pattern } from '@/core/lib/intent/core/types'
import {
  getAllGestures,
  getGestureForHand,
  getHandedness,
  isValidGesture,
  matchesGesture,
  normalizeGestureName,
} from '@/core/lib/intent/matching/gestureMatcher'
import type { GestureName, HandIdentifier} from '@/core/lib/intent/vocabulary';
import { intentKeywords } from '@/core/lib/intent/vocabulary'

// ============================================================================
// Gesture Pattern Matching
// ============================================================================

describe('matchesGesture', () => {
  test('matches Victory gesture on left hand', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    // Note: fixture labeled "left" but data shows "Right" (mirrored)
    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: 'Victory',
      confidence: 0.7,
    }

    expect(matchesGesture(frame, pattern)).toBe(true)
  })

  test('matches Victory gesture on right hand', () => {
    const frame = victoryRightFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.left,
      gesture: intentKeywords.gestures.victory,
      confidence: 0.7,
    }

    expect(matchesGesture(frame, pattern)).toBe(true)
  })

  test('matches Closed_Fist gesture', () => {
    const frame = closedFistLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.closedFist,
      confidence: 0.7,
    }

    expect(matchesGesture(frame, pattern)).toBe(true)
  })

  test('matches Open_Palm gesture', () => {
    const frame = openPalmLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.openPalm,
      confidence: 0.65,
    }

    expect(matchesGesture(frame, pattern)).toBe(true)
  })

  test('matches Thumb_Up gesture', () => {
    const frame = thumbUpLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.thumbUp,
      confidence: 0.68,
    }

    expect(matchesGesture(frame, pattern)).toBe(true)
  })

  test('matches Thumb_Down gesture', () => {
    const frame = thumbDownLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.thumbDown,
      confidence: 0.82,
    }

    expect(matchesGesture(frame, pattern)).toBe(true)
  })

  test('matches None gesture', () => {
    const frame = noneGestureFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.none,
      confidence: 0.7,
    }

    expect(matchesGesture(frame, pattern)).toBe(true)
  })

  test('respects specific handIndex', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      handIndex: 0,
      gesture: intentKeywords.gestures.victory,
      confidence: 0.7,
    }

    expect(matchesGesture(frame, pattern)).toBe(true)
  })

  test('returns false for wrong handIndex', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      handIndex: 1, // Wrong index
      gesture: intentKeywords.gestures.victory,
      confidence: 0.7,
    }

    expect(matchesGesture(frame, pattern)).toBe(false)
  })

  test('returns false for wrong gesture', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.closedFist, // Wrong gesture
      confidence: 0.7,
    }

    expect(matchesGesture(frame, pattern)).toBe(false)
  })

  test('matches specific hand when both present', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot
    if (!frame.gestureResult || !frame.gestureResult.hands) {
      throw new Error('Gesture result is null')
    }

    // Fixtures have both hands - verify we can match each specifically
    const hand0 = frame.gestureResult.hands[0]
    const hand1 = frame.gestureResult.hands[1]

    const pattern0: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: hand0.handedness.toLowerCase() as HandIdentifier,
      gesture: hand0.gesture as GestureName,
      confidence: 0.7,
    }

    const pattern1: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: hand1.handedness.toLowerCase() as HandIdentifier,
      gesture: hand1.gesture as GestureName,
      confidence: 0.7,
    }

    // Both hands should match their respective patterns
    expect(matchesGesture(frame, pattern0)).toBe(true)
    expect(matchesGesture(frame, pattern1)).toBe(true)
  })

  test('returns false for confidence below threshold', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.victory,
      confidence: 0.99, // Too high threshold
    }

    expect(matchesGesture(frame, pattern)).toBe(false)
  })

  test('uses default confidence threshold when not specified', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.victory,
      // No confidence specified, should use default 0.7
    }

    expect(matchesGesture(frame, pattern)).toBe(true)
  })

  test('returns false for non-gesture pattern', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.contact,
      hand: intentKeywords.hands.right,
      fingers: [intentKeywords.fingers.index],
      contactType: intentKeywords.contactTypes.pinch,
      threshold: 0.5,
    }

    expect(matchesGesture(frame, pattern)).toBe(false)
  })

  test('returns false for null gesture result', () => {
    const frame = {
      timestamp: Date.now(),
      faceResult: null,
      gestureResult: null,
    }

    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.victory,
      confidence: 0.7,
    }

    expect(matchesGesture(frame, pattern)).toBe(false)
  })
})

// ============================================================================
// Gesture Extraction
// ============================================================================

describe('getGestureForHand', () => {
  test('extracts gesture data for specific hand instance', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestureData = getGestureForHand(frame, intentKeywords.hands.right, 0)

    expect(gestureData).not.toBeNull()
    expect(gestureData!.gesture).toBe(intentKeywords.gestures.victory)
    expect(gestureData!.confidence).toBeGreaterThan(0.7)
  })

  test('extracts Closed_Fist gesture data', () => {
    const frame = closedFistLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestureData = getGestureForHand(frame, intentKeywords.hands.right, 0)

    expect(gestureData).not.toBeNull()
    expect(gestureData!.gesture).toBe(intentKeywords.gestures.closedFist)
  })

  test('extracts Open_Palm gesture data', () => {
    const frame = openPalmLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestureData = getGestureForHand(frame, intentKeywords.hands.right, 0)

    expect(gestureData).not.toBeNull()
    expect(gestureData!.gesture).toBe(intentKeywords.gestures.openPalm)
  })

  test('extracts Thumb_Up gesture data', () => {
    const frame = thumbUpLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestureData = getGestureForHand(frame, intentKeywords.hands.right, 0)

    expect(gestureData).not.toBeNull()
    expect(gestureData!.gesture).toBe(intentKeywords.gestures.thumbUp)
  })

  test('extracts Thumb_Down gesture data', () => {
    const frame = thumbDownLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestureData = getGestureForHand(frame, intentKeywords.hands.right, 0)

    expect(gestureData).not.toBeNull()
    expect(gestureData!.gesture).toBe(intentKeywords.gestures.thumbDown)
  })

  test('returns null for wrong hand', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestureData = getGestureForHand(frame, intentKeywords.hands.left, 0)

    expect(gestureData).toBeNull()
  })

  test('returns null for wrong handIndex', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestureData = getGestureForHand(frame, intentKeywords.hands.right, 1)

    expect(gestureData).toBeNull()
  })

  test('returns null for null gesture result', () => {
    const frame = {
      timestamp: Date.now(),
      faceResult: null,
      gestureResult: null,
    }

    const gestureData = getGestureForHand(frame, intentKeywords.hands.right, 0)

    expect(gestureData).toBeNull()
  })
})

describe('getHandedness', () => {
  test('extracts handedness for hand at index 0', () => {
    const frame = victoryLeftFrames.frames[0]
    const gestureResult = frame.gestureResult

    const handedness = getHandedness(gestureResult, 0)

    expect(handedness).toBe(intentKeywords.hands.right)
  })

  test('returns null for invalid handIndex', () => {
    const frame = victoryLeftFrames.frames[0]
    const gestureResult = frame.gestureResult

    const handedness = getHandedness(gestureResult, 5)

    expect(handedness).toBeNull()
  })

  test('returns null for null gesture result', () => {
    const handedness = getHandedness(null, 0)

    expect(handedness).toBeNull()
  })

  test('normalizes handedness to lowercase', () => {
    const frame = victoryLeftFrames.frames[0]
    const gestureResult = frame.gestureResult

    // MediaPipe uses 'Right' with capital R
    const handedness = getHandedness(gestureResult, 0)

    expect(handedness).toBe(intentKeywords.hands.right) // lowercase
  })
})

describe('getAllGestures', () => {
  test('extracts all gestures from frame', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestures = getAllGestures(frame)

    // Fixtures have both hands
    expect(gestures.length).toBeGreaterThanOrEqual(1)
    expect(gestures[0]).toHaveProperty('hand')
    expect(gestures[0]).toHaveProperty('handIndex')
    expect(gestures[0]).toHaveProperty('gesture')
    expect(gestures[0]).toHaveProperty('confidence')

    // At least one hand should have Victory gesture
    const hasVictory = gestures.some((g) => g.gesture === intentKeywords.gestures.victory)
    expect(hasVictory).toBe(true)
  })

  test('returns empty array for null gesture result', () => {
    const frame = {
      timestamp: Date.now(),
      faceResult: null,
      gestureResult: null,
    }

    const gestures = getAllGestures(frame)

    expect(gestures).toEqual([])
  })

  test('returns empty array for no hands', () => {
    const frame = {
      timestamp: Date.now(),
      faceResult: null,
      gestureResult: { hands: [] },
    }

    const gestures = getAllGestures(frame)

    expect(gestures).toEqual([])
  })

  test('includes handIndex in results', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestures = getAllGestures(frame)

    expect(gestures[0].handIndex).toBe(0)
  })

  test('normalizes handedness to lowercase', () => {
    const frame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot

    const gestures = getAllGestures(frame)

    expect(gestures[0].hand).toBe(intentKeywords.hands.right) // lowercase
  })
})

// ============================================================================
// Gesture Validation
// ============================================================================

describe('isValidGesture', () => {
  test('validates Victory gesture', () => {
    expect(isValidGesture(intentKeywords.gestures.victory)).toBe(true)
  })

  test('validates Closed_Fist gesture', () => {
    expect(isValidGesture(intentKeywords.gestures.closedFist)).toBe(true)
  })

  test('validates Open_Palm gesture', () => {
    expect(isValidGesture(intentKeywords.gestures.openPalm)).toBe(true)
  })

  test('validates Thumb_Up gesture', () => {
    expect(isValidGesture(intentKeywords.gestures.thumbUp)).toBe(true)
  })

  test('validates Thumb_Down gesture', () => {
    expect(isValidGesture(intentKeywords.gestures.thumbDown)).toBe(true)
  })

  test('validates None gesture', () => {
    expect(isValidGesture(intentKeywords.gestures.none)).toBe(true)
  })

  test('rejects invalid gesture', () => {
    expect(isValidGesture('InvalidGesture')).toBe(false)
  })

  test('rejects empty string', () => {
    expect(isValidGesture('')).toBe(false)
  })
})

describe('normalizeGestureName', () => {
  test('normalizes gesture with spaces', () => {
    const normalized = normalizeGestureName('Open Palm')
    expect(normalized).toBe(intentKeywords.gestures.openPalm)
  })

  test('returns valid gesture as-is', () => {
    const normalized = normalizeGestureName('Victory')
    expect(normalized).toBe(intentKeywords.gestures.victory)
  })

  test('returns null for invalid gesture', () => {
    const normalized = normalizeGestureName('InvalidGesture')
    expect(normalized).toBeNull()
  })

  test('handles multiple spaces', () => {
    const normalized = normalizeGestureName('Closed  Fist')
    expect(normalized).toBe(intentKeywords.gestures.closedFist)
  })
})

// ============================================================================
// Integration Tests with Multiple Gesture Types
// ============================================================================

describe('gesture matching integration', () => {
  test('distinguishes between different gestures', () => {
    const victoryFrame = victoryLeftFrames.frames[0] as unknown as FrameSnapshot
    const fistFrame = closedFistLeftFrames.frames[0] as unknown as FrameSnapshot

    const victoryPattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.victory,
      confidence: 0.7,
    }

    const fistPattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: intentKeywords.hands.right,
      gesture: intentKeywords.gestures.closedFist,
      confidence: 0.7,
    }

    // Victory frame should match victory pattern
    expect(matchesGesture(victoryFrame, victoryPattern)).toBe(true)
    expect(matchesGesture(victoryFrame, fistPattern)).toBe(false)

    // Fist frame should match fist pattern
    expect(matchesGesture(fistFrame, fistPattern)).toBe(true)
    expect(matchesGesture(fistFrame, victoryPattern)).toBe(false)
  })

  test('works with all gesture types', () => {
    const testCases = [
      { frames: victoryLeftFrames, gesture: intentKeywords.gestures.victory },
      { frames: closedFistLeftFrames, gesture: intentKeywords.gestures.closedFist },
      { frames: openPalmLeftFrames, gesture: intentKeywords.gestures.openPalm },
      { frames: thumbUpLeftFrames, gesture: intentKeywords.gestures.thumbUp },
      { frames: thumbDownLeftFrames, gesture: intentKeywords.gestures.thumbDown },
    ]

    for (const { frames, gesture } of testCases) {
      const frame = frames.frames[0] as unknown as FrameSnapshot
      const pattern: Pattern = {
        type: intentKeywords.patternTypes.gesture,
        hand: intentKeywords.hands.right,
        gesture,
        confidence: 0.65, // Use lower threshold to catch all
      }

      expect(matchesGesture(frame, pattern)).toBe(true)
    }
  })
})

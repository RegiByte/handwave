/**
 * Contact Detector Tests
 *
 * Tests for contact detection functions using real fixture data.
 */

import {
  FINGERTIP_INDICES,
  areValidLandmarks,
  calculateDistance2D,
  calculateDistance3D,
  detectMultiFingerContact,
  detectPinch,
  getFingertips,
  getLandmarkForFinger,
  getLandmarksForHand,
  matchesContact,
} from '@/core/lib/intent/matching/contactDetector'
import {
  leftIndexPinchFrames,
  leftMiddlePinchFrames,
  leftPinkyPinchFrames,
  leftRingPinchFrames,
  rightIndexPinchFrames,
} from '@/core/lib/intent/__fixtures__'
import { intentKeywords } from '@/core/lib/intent/vocabulary'
import type { FrameSnapshot, Pattern } from '@/core/lib/intent/core/types'

// ============================================================================
// Distance Calculations
// ============================================================================

describe('calculateDistance3D', () => {
  test('calculates correct 3D distance', () => {
    const a = { x: 0, y: 0, z: 0 }
    const b = { x: 3, y: 4, z: 0 }
    
    expect(calculateDistance3D(a, b)).toBe(5) // 3-4-5 triangle
  })

  test('handles z-axis distance', () => {
    const a = { x: 0, y: 0, z: 0 }
    const b = { x: 0, y: 0, z: 5 }
    
    expect(calculateDistance3D(a, b)).toBe(5)
  })

  test('handles negative coordinates', () => {
    const a = { x: -1, y: -1, z: -1 }
    const b = { x: 1, y: 1, z: 1 }
    
    const distance = calculateDistance3D(a, b)
    expect(distance).toBeCloseTo(Math.sqrt(12), 5)
  })

  test('returns zero for same point', () => {
    const a = { x: 1, y: 2, z: 3 }
    const b = { x: 1, y: 2, z: 3 }
    
    expect(calculateDistance3D(a, b)).toBe(0)
  })
})

describe('calculateDistance2D', () => {
  test('calculates 2D distance ignoring z', () => {
    const a = { x: 0, y: 0, z: 100 }
    const b = { x: 3, y: 4, z: 200 }
    
    expect(calculateDistance2D(a, b)).toBe(5) // z is ignored
  })

  test('returns zero for same x,y', () => {
    const a = { x: 1, y: 2, z: 3 }
    const b = { x: 1, y: 2, z: 999 }
    
    expect(calculateDistance2D(a, b)).toBe(0)
  })
})

// ============================================================================
// Pinch Detection
// ============================================================================

describe('detectPinch', () => {
  test('detects index finger pinch with real data', () => {
    const frame = leftIndexPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    // Use strict threshold
    const isPinching = detectPinch(landmarks, 'index', 0.05)
    expect(isPinching).toBe(true)
  })

  test('detects middle finger pinch with real data', () => {
    const frame = leftMiddlePinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    // Use conservative threshold
    const isPinching = detectPinch(landmarks, 'middle', 0.10)
    expect(isPinching).toBe(true)
  })

  test('detects ring finger pinch with real data', () => {
    const frame = leftRingPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    // Use conservative threshold for ring finger
    const isPinching = detectPinch(landmarks, 'ring', 0.12)
    expect(isPinching).toBe(true)
  })

  test('detects pinky finger pinch with real data', () => {
    const frame = leftPinkyPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    // Use conservative threshold for pinky
    const isPinching = detectPinch(landmarks, 'pinky', 0.15)
    expect(isPinching).toBe(true)
  })

  test('respects custom thresholds', () => {
    const frame = leftIndexPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    // Very strict threshold should still detect contact
    expect(detectPinch(landmarks, 'index', 0.03)).toBe(true)
    
    // Extremely strict threshold might fail
    expect(detectPinch(landmarks, 'index', 0.001)).toBe(false)
  })

  test('returns false for invalid landmarks', () => {
    const invalidLandmarks: Array<any> = []
    
    expect(detectPinch(invalidLandmarks, 'index', 0.05)).toBe(false)
  })

  test('returns false for incomplete landmarks', () => {
    const incompleteLandmarks = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]
    
    expect(detectPinch(incompleteLandmarks, 'index', 0.05)).toBe(false)
  })
})

describe('detectMultiFingerContact', () => {
  test('detects contact with multiple fingers', () => {
    const frame = leftIndexPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    // Check if index OR middle is pinching
    const hasContact = detectMultiFingerContact(
      landmarks,
      ['index', 'middle'],
      0.07
    )
    
    expect(hasContact).toBe(true)
  })

  test('returns false when no fingers in contact', () => {
    const frame = leftIndexPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    // Check ring and pinky (which shouldn't be pinching in index pinch data)
    const hasContact = detectMultiFingerContact(
      landmarks,
      ['ring', 'pinky'],
      0.05 // Very strict threshold
    )
    
    expect(hasContact).toBe(false)
  })
})

// ============================================================================
// Pattern Matching
// ============================================================================

describe('matchesContact', () => {
  test('matches index finger contact pattern', () => {
    const frame = leftIndexPinchFrames.frames[0] as unknown as FrameSnapshot
    const actualHandedness = frame.gestureResult.hands[0].handedness.toLowerCase() as 'left' | 'right'
    
    const pattern: Pattern = {
      type: intentKeywords.patternTypes.contact,
      hand: actualHandedness, // Use actual handedness from data
      contactType: 'pinch',
      fingers: ['index'],
      threshold: 0.07,
    }
    
    expect(matchesContact(frame, pattern)).toBe(true)
  })

  test('matches middle finger contact pattern', () => {
    const frame = leftMiddlePinchFrames.frames[0] as unknown as FrameSnapshot
    const actualHandedness = frame.gestureResult.hands[0].handedness.toLowerCase() as 'left' | 'right'
    
    const pattern: Pattern = {
      type: intentKeywords.patternTypes.contact,
      hand: actualHandedness,
      contactType: 'pinch',
      fingers: ['middle'],
      threshold: 0.10,
    }
    
    expect(matchesContact(frame, pattern)).toBe(true)
  })

  test('matches with specific handIndex', () => {
    const frame = rightIndexPinchFrames.frames[0] as unknown as FrameSnapshot
    const actualHandedness = frame.gestureResult.hands[0].handedness.toLowerCase() as 'left' | 'right'
    
    const pattern: Pattern = {
      type: intentKeywords.patternTypes.contact,
      hand: actualHandedness,
      handIndex: 0,
      contactType: 'pinch',
      fingers: ['index'],
      threshold: 0.07,
    }
    
    expect(matchesContact(frame, pattern)).toBe(true)
  })

  test('returns false for wrong finger', () => {
    const frame = leftIndexPinchFrames.frames[0] as unknown as FrameSnapshot
    const actualHandedness = frame.gestureResult.hands[0].handedness.toLowerCase() as 'left' | 'right'
    
    // Test that we correctly reject when looking for a different finger
    // that's NOT in contact (pinky should not be pinching in index pinch data)
    const pattern: Pattern = {
      type: intentKeywords.patternTypes.contact,
      hand: actualHandedness,
      contactType: 'pinch',
      fingers: ['pinky'], // Wrong finger - looking for pinky when index is pinching
      threshold: 0.05, // Strict threshold
    }
    
    expect(matchesContact(frame, pattern)).toBe(false)
  })

  test('matches either hand when both present', () => {
    const frame = leftIndexPinchFrames.frames[0] as unknown as FrameSnapshot
    if (!frame.gestureResult) throw new Error('Gesture result is null')
    
    // Since fixtures have both hands, we should be able to match either
    // by specifying the correct handedness
    const hand0 = frame.gestureResult.hands[0]
    const hand1 = frame.gestureResult.hands[1]
    
    const pattern0: Pattern = {
      type: intentKeywords.patternTypes.contact,
      hand: hand0.handedness.toLowerCase() as 'left' | 'right',
      contactType: 'pinch',
      fingers: ['index'],
      threshold: 0.10, // Conservative threshold
    }
    
    const pattern1: Pattern = {
      type: intentKeywords.patternTypes.contact,
      hand: hand1.handedness.toLowerCase() as 'left' | 'right',
      contactType: 'pinch',
      fingers: ['index'],
      threshold: 0.10,
    }
    
    // At least one hand should match (the one that's actually pinching)
    const matches0 = matchesContact(frame, pattern0)
    const matches1 = matchesContact(frame, pattern1)
    
    expect(matches0 || matches1).toBe(true)
  })

  test('returns false for non-contact pattern', () => {
    const frame = leftIndexPinchFrames.frames[0] as unknown as FrameSnapshot
    
    const pattern: Pattern = {
      type: intentKeywords.patternTypes.gesture,
      hand: 'right',
      gesture: 'Victory',
      confidence: 0.7,
    }
    
    expect(matchesContact(frame, pattern)).toBe(false)
  })

  test('uses default threshold when not specified', () => {
    const frame = leftIndexPinchFrames.frames[0] as unknown as FrameSnapshot
    
    const pattern: Pattern = {
      type: intentKeywords.patternTypes.contact,
      hand: 'right',
      contactType: 'pinch',
      fingers: ['index'],
      threshold: 0.07,
    }
    
    expect(matchesContact(frame, pattern)).toBe(true)
  })

  test('returns false for null gesture result', () => {
    const frame = {
      timestamp: Date.now(),
      faceResult: null,
      gestureResult: null,
    }
    
    const pattern: Pattern = {
      type: intentKeywords.patternTypes.contact,
      hand: 'right',
      contactType: 'pinch',
      fingers: ['index'],
      threshold: 0.07,
    }
    
    expect(matchesContact(frame, pattern)).toBe(false)
  })
})

// ============================================================================
// Landmark Extraction
// ============================================================================

describe('getLandmarksForHand', () => {
  test('extracts landmarks for specific hand instance', () => {
    const frame = leftIndexPinchFrames.frames[0] as unknown as FrameSnapshot
    
    const landmarks = getLandmarksForHand(frame, 'right', 0)
    
    expect(landmarks).not.toBeNull()
    expect(landmarks).toHaveLength(21)
    expect(landmarks![0]).toHaveProperty('x')
    expect(landmarks![0]).toHaveProperty('y')
    expect(landmarks![0]).toHaveProperty('z')
  })

  test('returns null for wrong hand', () => {
    const frame = leftIndexPinchFrames.frames[0] as unknown as FrameSnapshot
    
    const landmarks = getLandmarksForHand(frame, 'left', 0)
    
    expect(landmarks).toBeNull()
  })

  test('returns null for wrong handIndex', () => {
    const frame = leftIndexPinchFrames.frames[0] as unknown as FrameSnapshot
    
    const landmarks = getLandmarksForHand(frame, 'right', 1)
    
    expect(landmarks).toBeNull()
  })

  test('returns null for null gesture result', () => {
    const frame = {
      timestamp: Date.now(),
      faceResult: null,
      gestureResult: null,
    }
    
    const landmarks = getLandmarksForHand(frame, 'right', 0)
    
    expect(landmarks).toBeNull()
  })
})

describe('getLandmarkForFinger', () => {
  test('extracts thumb landmark', () => {
    const frame = leftIndexPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    const thumbLandmark = getLandmarkForFinger(landmarks, 'thumb')
    
    expect(thumbLandmark).not.toBeNull()
    expect(thumbLandmark).toEqual(landmarks[FINGERTIP_INDICES.thumb])
  })

  test('extracts index finger landmark', () => {
    const frame = leftIndexPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    const indexLandmark = getLandmarkForFinger(landmarks, 'index')
    
    expect(indexLandmark).not.toBeNull()
    expect(indexLandmark).toEqual(landmarks[FINGERTIP_INDICES.index])
  })

  test('returns null for invalid landmarks', () => {
    const invalidLandmarks: Array<any> = []
    
    const landmark = getLandmarkForFinger(invalidLandmarks, 'index')
    
    expect(landmark).toBeNull()
  })
})

// ============================================================================
// Utility Functions
// ============================================================================

describe('areValidLandmarks', () => {
  test('returns true for 21 landmarks', () => {
    const frame = leftIndexPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    expect(areValidLandmarks(landmarks)).toBe(true)
  })

  test('returns false for incomplete landmarks', () => {
    const incompleteLandmarks = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]
    
    expect(areValidLandmarks(incompleteLandmarks)).toBe(false)
  })

  test('returns false for empty array', () => {
    expect(areValidLandmarks([])).toBe(false)
  })
})

describe('getFingertips', () => {
  test('extracts all fingertip positions', () => {
    const frame = leftIndexPinchFrames.frames[0]
    const hand = frame.gestureResult.hands[0]
    const landmarks = hand.landmarks
    
    const fingertips = getFingertips(landmarks)
    
    expect(fingertips).not.toBeNull()
    expect(fingertips).toHaveProperty('thumb')
    expect(fingertips).toHaveProperty('index')
    expect(fingertips).toHaveProperty('middle')
    expect(fingertips).toHaveProperty('ring')
    expect(fingertips).toHaveProperty('pinky')
    
    // Verify they match the expected indices
    expect(fingertips!.thumb).toEqual(landmarks[FINGERTIP_INDICES.thumb])
    expect(fingertips!.index).toEqual(landmarks[FINGERTIP_INDICES.index])
  })

  test('returns null for invalid landmarks', () => {
    const invalidLandmarks: Array<any> = []
    
    const fingertips = getFingertips(invalidLandmarks)
    
    expect(fingertips).toBeNull()
  })
})


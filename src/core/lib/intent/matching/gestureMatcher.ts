/**
 * Intent Engine - Gesture Matcher
 *
 * Pure functions for matching MediaPipe gestures.
 *
 * Responsibilities:
 * - Match gesture patterns against frames
 * - Extract gesture data for specific hands
 * - Apply confidence thresholds
 * - Handle missing data gracefully
 *
 * Philosophy:
 * - Pure predicate functions
 * - No side effects
 * - Clear error handling
 */

import type { FrameSnapshot, Pattern } from '@/core/lib/intent/core/types'
import { intentKeywords } from '@/core/lib/intent/vocabulary'

// ============================================================================
// Gesture Matching
// ============================================================================

/**
 * Check if a frame matches a gesture pattern
 *
 * @param frame - Frame to check
 * @param pattern - Pattern to match (must be type 'gesture')
 * @returns True if pattern matches
 */
export function matchesGesture(
  frame: FrameSnapshot,
  pattern: Pattern,
): boolean {
  // Type guard: ensure it's a gesture pattern
  if (pattern.type !== intentKeywords.patternTypes.gesture) {
    return false
  }

  // Extract gesture result from frame
  const gestureResult = frame.gestureResult
  if (
    !gestureResult ||
    !gestureResult.hands ||
    gestureResult.hands.length === 0
  ) {
    return false
  }

  // Find matching hand(s)
  const matchingHands = gestureResult.hands.filter((hand) => {
    // Normalize handedness (MediaPipe uses 'Left'/'Right', we use 'left'/'right')
    const handedness = hand.handedness?.toLowerCase() as 'left' | 'right'

    // Check handedness matches
    if (handedness !== pattern.hand) {
      return false
    }

    // If handIndex specified, match ONLY that specific hand instance
    if (
      pattern.handIndex !== undefined &&
      hand.handIndex !== pattern.handIndex
    ) {
      return false
    }

    return true
  })

  // No matching hands found
  if (matchingHands.length === 0) {
    return false
  }

  // Check gesture and confidence for each matching hand
  for (const hand of matchingHands) {
    const gesture = hand.gesture
    const confidence = hand.gestureScore ?? 0

    // Check if gesture name matches
    if (gesture !== pattern.gesture) {
      continue
    }

    // Check confidence threshold
    // Use provided confidence or default to 0.7
    const threshold = pattern.confidence ?? 0.7

    if (confidence >= threshold) {
      return true
    }
  }

  return false
}

/**
 * Get gesture data for a specific hand instance
 *
 * @param frame - Frame to extract from
 * @param hand - Hand identifier ('left' or 'right')
 * @param handIndex - Hand instance index (0-3)
 * @returns Gesture data or null if not found
 */
export function getGestureForHand(
  frame: FrameSnapshot,
  hand: 'left' | 'right',
  handIndex: number,
): { gesture: string; confidence: number } | null {
  const gestureResult = frame.gestureResult
  if (
    !gestureResult ||
    !gestureResult.hands ||
    gestureResult.hands.length === 0
  ) {
    return null
  }

  // Find the specific hand instance
  const matchingHand = gestureResult.hands.find((h) => {
    const handedness = h.handedness?.toLowerCase() as 'left' | 'right'
    return handedness === hand && h.handIndex === handIndex
  })

  if (!matchingHand) {
    return null
  }

  return {
    gesture: matchingHand.gesture,
    confidence: matchingHand.gestureScore ?? 0,
  }
}

/**
 * Get handedness for a hand at a specific index
 *
 * @param gestureResult - MediaPipe gesture result
 * @param handIndex - Hand index
 * @returns 'left', 'right', or null
 */
export function getHandedness(
  gestureResult: any, // TODO: Type this with MediaPipe types
  handIndex: number,
): 'left' | 'right' | null {
  if (
    !gestureResult ||
    !gestureResult.hands ||
    gestureResult.hands.length === 0
  ) {
    return null
  }

  const hand = gestureResult.hands.find((h: any) => h.handIndex === handIndex)
  if (!hand || !hand.handedness) {
    return null
  }

  // Normalize handedness (MediaPipe uses 'Left'/'Right', we use 'left'/'right')
  return hand.handedness.toLowerCase() as 'left' | 'right'
}

/**
 * Get all detected gestures in a frame
 *
 * @param frame - Frame to extract from
 * @returns Array of gesture data with hand indices
 */
export function getAllGestures(frame: FrameSnapshot): Array<{
  hand: 'left' | 'right'
  handIndex: number
  gesture: string
  confidence: number
}> {
  const gestureResult = frame.gestureResult
  if (
    !gestureResult ||
    !gestureResult.hands ||
    gestureResult.hands.length === 0
  ) {
    return []
  }

  return gestureResult.hands.map((h) => ({
    hand: h.handedness?.toLowerCase() as 'left' | 'right',
    handIndex: h.handIndex,
    gesture: h.gesture,
    confidence: h.gestureScore ?? 0,
  }))
}

// ============================================================================
// Gesture Validation
// ============================================================================

/**
 * Check if a gesture name is valid
 *
 * @param gestureName - Gesture name to validate
 * @returns True if valid
 */
export function isValidGesture(gestureName: string): boolean {
  const validGestures = Object.values(intentKeywords.gestures)
  return validGestures.includes(gestureName as any)
}

/**
 * Normalize gesture name (handle case variations)
 *
 * @param gestureName - Gesture name to normalize
 * @returns Normalized gesture name or null if invalid
 */
export function normalizeGestureName(gestureName: string): string | null {
  // MediaPipe uses specific casing (e.g., 'Open_Palm')
  // This function handles variations
  const normalized = gestureName.replace(/\s+/g, '_')

  return isValidGesture(normalized) ? normalized : null
}

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
  pattern: Pattern
): boolean {
  // Type guard: ensure it's a gesture pattern
  if (pattern.type !== intentKeywords.patternTypes.gesture) {
    return false
  }

  // TODO: Implement in Phase 1
  // TypeScript now knows pattern is GesturePattern
  // 1. Extract gesture result from frame
  // 2. Find hand by handedness (left/right) and optionally handIndex
  // 3. If handIndex specified, match ONLY that hand instance
  // 4. If handIndex not specified, match ANY hand of that handedness
  // 5. Check gesture name matches
  // 6. Check confidence threshold
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
  handIndex: number
): { gesture: string; confidence: number } | null {
  // TODO: Implement in Phase 1
  // 1. Extract gesture result from frame
  // 2. Find hand by handedness AND handIndex
  // 3. Return gesture name and confidence
  return null
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
  handIndex: number
): 'left' | 'right' | null {
  // TODO: Implement in Phase 1
  // Extract handedness from MediaPipe result
  return null
}

/**
 * Get all detected gestures in a frame
 *
 * @param frame - Frame to extract from
 * @returns Array of gesture data with hand indices
 */
export function getAllGestures(
  frame: FrameSnapshot
): Array<{
  hand: 'left' | 'right'
  handIndex: number
  gesture: string
  confidence: number
}> {
  // TODO: Implement in Phase 1
  // Return all detected hands with their indices (0-3)
  return []
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


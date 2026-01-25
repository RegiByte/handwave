/**
 * Intent Engine - Contact Detector
 *
 * Pure functions for detecting finger-to-thumb contact (pinch/touch).
 *
 * Responsibilities:
 * - Detect pinch gestures (thumb-to-finger contact)
 * - Calculate 3D distances between landmarks
 * - Support multiple finger combinations
 * - Configurable thresholds
 *
 * Philosophy:
 * - Pure functions only
 * - Accurate 3D distance calculations
 * - Clear threshold semantics
 */

import { intentKeywords } from '../vocabulary'
import type { FrameSnapshot, Pattern, Vector3 } from '../vocabulary'

// ============================================================================
// Landmark Indices (MediaPipe Hand Landmarks)
// ============================================================================

/**
 * MediaPipe hand landmark indices for fingertips
 */
export const FINGERTIP_INDICES = {
  [intentKeywords.fingers.thumb]: 4,
  [intentKeywords.fingers.index]: 8,
  [intentKeywords.fingers.middle]: 12,
  [intentKeywords.fingers.ring]: 16,
  [intentKeywords.fingers.pinky]: 20,
} as const

// ============================================================================
// Contact Detection
// ============================================================================

/**
 * Check if a frame matches a contact pattern
 *
 * @param frame - Frame to check
 * @param pattern - Pattern to match (must be type 'contact')
 * @returns True if pattern matches
 */
export function matchesContact(
  frame: FrameSnapshot,
  pattern: Pattern
): boolean {
  // Type guard: ensure it's a contact pattern
  if (pattern.type !== intentKeywords.patternTypes.contact) {
    return false
  }

  // Extract hands from canonical detection frame
  const hands = frame.detectionFrame?.detectors?.hand
  if (!hands || hands.length === 0) {
    return false
  }

  // Find matching hand(s)
  const matchingHands = hands.filter((hand) => {
    // Normalize handedness (MediaPipe uses 'Left'/'Right', we use 'left'/'right')
    const handedness = hand.handedness?.toLowerCase() as 'left' | 'right'
    
    // Check handedness matches
    if (handedness !== pattern.hand) {
      return false
    }

    // If handIndex specified, match ONLY that specific hand instance
    if (pattern.handIndex !== undefined && hand.handIndex !== pattern.handIndex) {
      return false
    }

    return true
  })

  // No matching hands found
  if (matchingHands.length === 0) {
    return false
  }

  // Check contact for each matching hand
  const threshold = pattern.threshold ?? 0.07 // Default conservative threshold
  
  for (const hand of matchingHands) {
    const landmarks = hand.landmarks
    if (!landmarks || landmarks.length < 21) {
      continue
    }

    // Check if any of the specified fingers are in contact with thumb
    const hasContact = pattern.fingers.some((finger) => {
      return detectPinch(landmarks, finger, threshold)
    })

    if (hasContact) {
      return true
    }
  }

  return false
}

/**
 * Detect pinch between thumb and a specific finger
 *
 * @param landmarks - Hand landmarks (array of 21 landmarks)
 * @param finger - Finger to check (index, middle, ring, pinky)
 * @param threshold - Distance threshold (normalized)
 * @returns True if pinching
 */
export function detectPinch(
  landmarks: ReadonlyArray<Vector3>,
  finger: keyof typeof FINGERTIP_INDICES,
  threshold: number
): boolean {
  if (landmarks.length < 21) return false

  const thumbIndex = FINGERTIP_INDICES[intentKeywords.fingers.thumb]
  const fingerIndex = FINGERTIP_INDICES[finger]

  const distance = calculateDistance3D(
    landmarks[thumbIndex],
    landmarks[fingerIndex]
  )

  return distance < threshold
}

/**
 * Detect contact with multiple fingers
 *
 * @param landmarks - Hand landmarks
 * @param fingers - Fingers to check
 * @param threshold - Distance threshold
 * @returns True if any finger is in contact
 */
export function detectMultiFingerContact(
  landmarks: ReadonlyArray<Vector3>,
  fingers: ReadonlyArray<keyof typeof FINGERTIP_INDICES>,
  threshold: number
): boolean {
  return fingers.some((finger) => detectPinch(landmarks, finger, threshold))
}

// ============================================================================
// Distance Calculations
// ============================================================================

/**
 * Calculate 3D Euclidean distance between two landmarks
 *
 * @param a - First landmark
 * @param b - Second landmark
 * @returns Distance (normalized coordinates)
 */
export function calculateDistance3D(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z

  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Calculate 2D distance (ignoring z)
 *
 * @param a - First landmark
 * @param b - Second landmark
 * @returns Distance (normalized coordinates)
 */
export function calculateDistance2D(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y

  return Math.sqrt(dx * dx + dy * dy)
}

// ============================================================================
// Landmark Extraction
// ============================================================================

/**
 * Get landmark for a specific finger from hand landmarks
 *
 * @param landmarks - Hand landmarks (21 points)
 * @param finger - Finger identifier
 * @returns Landmark or null if invalid
 */
export function getLandmarkForFinger(
  landmarks: ReadonlyArray<Vector3>,
  finger: keyof typeof FINGERTIP_INDICES
): Vector3 | null {
  if (landmarks.length < 21) return null

  const index = FINGERTIP_INDICES[finger]
  return landmarks[index] || null
}

/**
 * Get landmarks for a specific hand instance from frame
 *
 * @param frame - Frame to extract from
 * @param hand - Hand identifier ('left' or 'right')
 * @param handIndex - Hand instance index (0-3)
 * @returns Landmarks or null if not found
 */
export function getLandmarksForHand(
  frame: FrameSnapshot,
  hand: 'left' | 'right',
  handIndex: number
): Array<Vector3> | null {
  const hands = frame.detectionFrame?.detectors?.hand
  if (!hands || hands.length === 0) {
    return null
  }

  // Find the specific hand instance
  const matchingHand = hands.find((h) => {
    const handedness = h.handedness?.toLowerCase() as 'left' | 'right'
    return handedness === hand && h.handIndex === handIndex
  })

  if (!matchingHand || !matchingHand.landmarks) {
    return null
  }

  // Return landmarks (already in Vector3 format: {x, y, z})
  return matchingHand.landmarks
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if landmarks array is valid
 *
 * @param landmarks - Landmarks to validate
 * @returns True if valid (has 21 landmarks)
 */
export function areValidLandmarks(landmarks: ReadonlyArray<Vector3>): boolean {
  return landmarks.length === 21
}

/**
 * Get all fingertip positions from landmarks
 *
 * @param landmarks - Hand landmarks
 * @returns Object with fingertip positions
 */
export function getFingertips(
  landmarks: ReadonlyArray<Vector3>
): Record<string, Vector3> | null {
  if (!areValidLandmarks(landmarks)) return null

  return {
    [intentKeywords.fingers.thumb]: landmarks[FINGERTIP_INDICES.thumb],
    [intentKeywords.fingers.index]: landmarks[FINGERTIP_INDICES.index],
    [intentKeywords.fingers.middle]: landmarks[FINGERTIP_INDICES.middle],
    [intentKeywords.fingers.ring]: landmarks[FINGERTIP_INDICES.ring],
    [intentKeywords.fingers.pinky]: landmarks[FINGERTIP_INDICES.pinky],
  }
}

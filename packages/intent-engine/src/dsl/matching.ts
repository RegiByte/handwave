/**
 * Intent DSL v2 - Pattern Matching
 *
 * Matches pattern expressions against frame data.
 * Handles gesture, pinch, anyOf, and allOf patterns.
 */

import { intentKeywords } from '@handwave/intent-engine'
import type { FrameSnapshot } from '@handwave/intent-engine'
import type {
  CompositePatternDef,
  GestureName,
  GesturePatternDef,
  HandIdentifier,
  PatternDef,
  PatternExpr,
  PinchPatternDef,
  Position,
  SequencePatternDef,
} from './types'

// ============================================================================
// MAIN MATCHING FUNCTION
// ============================================================================

/**
 * Match a pattern expression against a frame.
 *
 * @param frame - Current frame with detection data
 * @param pattern - Pattern expression to match
 * @returns True if pattern matches
 */
export function matchPatternExpr(
  frame: FrameSnapshot,
  pattern: PatternExpr
): boolean {
  const def = pattern._intent.def
  const result = matchPatternDef(frame, def)
  
  return result
}

/**
 * Match a pattern definition against a frame.
 */
export function matchPatternDef(
  frame: FrameSnapshot,
  def: PatternDef,
  history?: Array<FrameSnapshot>
): boolean {
  switch (def.type) {
    case 'gesture':
      return matchGesturePattern(frame, def)
    case 'pinch':
      return matchPinchPattern(frame, def)
    case 'anyOf':
      return matchAnyOfPattern(frame, def)
    case 'allOf':
      return matchAllOfPattern(frame, def)
    case 'sequence':
      return matchSequencePattern(frame, def, history)
    default: {
      const _exhaustive: never = def
      console.warn('Unknown pattern type:', (_exhaustive as PatternDef).type)
      return false
    }
  }
}

// ============================================================================
// GESTURE PATTERN MATCHING
// ============================================================================

/**
 * Match a gesture pattern against a frame.
 */
function matchGesturePattern(
  frame: FrameSnapshot,
  def: GesturePatternDef
): boolean {
  const gestureResult = frame.gestureResult
  if (!gestureResult?.hands || gestureResult.hands.length === 0) {
    return false
  }

  // Find a hand that matches
  return gestureResult.hands.some((hand) => {
    // Check handedness
    const handedness = hand.handedness.toLowerCase() as 'left' | 'right'
    if (!matchesHand(handedness, def.hand)) {
      return false
    }

    // Check gesture
    if (hand.gesture !== def.gesture) {
      return false
    }

    // Check confidence
    if (hand.gestureScore < def.confidence) {
      return false
    }

    return true
  })
}

// ============================================================================
// PINCH PATTERN MATCHING
// ============================================================================

/**
 * Match a pinch pattern against a frame.
 */
function matchPinchPattern(
  frame: FrameSnapshot,
  def: PinchPatternDef
): boolean {
  const gestureResult = frame.gestureResult
  if (!gestureResult?.hands || gestureResult.hands.length === 0) {
    return false
  }

  // Find a hand that matches
  return gestureResult.hands.some((hand) => {
    // Check handedness
    const handedness = hand.handedness.toLowerCase() as 'left' | 'right'
    if (!matchesHand(handedness, def.hand)) {
      return false
    }

    // Check pinch - measure distance between fingertip and thumb tip
    if (!hand.landmarks || hand.landmarks.length < 21) {
      return false
    }

    if (hand.gesture !== intentKeywords.gestures.none) {
      // another gesture is active, so this pinch is not valid
      return false
    }

    const distance = calculatePinchDistance(hand.landmarks, def.finger)
    return distance <= def.threshold
  })
}

/**
 * Calculate pinch distance between a finger and thumb.
 */
function calculatePinchDistance(
  landmarks: Array<{ x: number; y: number; z: number }>,
  finger: string
): number {
  // Landmark indices:
  // Thumb tip: 4
  // Index tip: 8
  // Middle tip: 12
  // Ring tip: 16
  // Pinky tip: 20

  const thumbTip = landmarks[4]
  let fingerTip: { x: number; y: number; z: number }

  switch (finger) {
    case 'index':
      fingerTip = landmarks[8]
      break
    case 'middle':
      fingerTip = landmarks[12]
      break
    case 'ring':
      fingerTip = landmarks[16]
      break
    case 'pinky':
      fingerTip = landmarks[20]
      break
    default:
      return Infinity
  }

  // Calculate 3D distance
  const dx = fingerTip.x - thumbTip.x
  const dy = fingerTip.y - thumbTip.y
  const dz = fingerTip.z - thumbTip.z

  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

// ============================================================================
// COMPOSITE PATTERN MATCHING
// ============================================================================

/**
 * Match an anyOf pattern (OR logic).
 */
function matchAnyOfPattern(
  frame: FrameSnapshot,
  def: CompositePatternDef
): boolean {
  return def.patterns.some((pattern) => matchPatternExpr(frame, pattern))
}

/**
 * Match an allOf pattern (AND logic).
 */
function matchAllOfPattern(
  frame: FrameSnapshot,
  def: CompositePatternDef
): boolean {
  return def.patterns.every((pattern) => matchPatternExpr(frame, pattern))
}

// ============================================================================
// SEQUENCE PATTERN MATCHING
// ============================================================================

/**
 * Match a sequence pattern.
 * Supports both concurrent (all at once) and sequential (ordered) modes.
 */
function matchSequencePattern(
  frame: FrameSnapshot,
  def: SequencePatternDef,
  history?: Array<FrameSnapshot>
): boolean {
  if (def.mode === 'concurrent') {
    // Concurrent mode: all patterns must match in current frame
    // This is equivalent to allOf - used for two-hand patterns
    return def.patterns.every((pattern) => matchPatternExpr(frame, pattern))
  } else {
    // Sequential mode: patterns must match in order over time
    // This requires history and temporal tracking
    if (!history || history.length === 0) {
      return false
    }

    // Sequential matching not yet implemented
    // Will require tracking which patterns matched in which frames
    // and ensuring they happened in order within the time window
    console.warn('Sequential sequence patterns not yet implemented')
    return false
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a detected hand matches the required hand identifier.
 */
function matchesHand(
  detected: 'left' | 'right',
  required: HandIdentifier
): boolean {
  if (required === 'any') {
    return true
  }
  return detected === required
}

/**
 * Find the primary pattern in a composite pattern tree.
 * Recursively searches for a pattern marked with .primary()
 * For anyOf patterns, only searches branches that actually match.
 */
function findPrimaryPattern(
  patterns: Array<PatternExpr>,
  frame?: FrameSnapshot,
  isInsideAnyOf: boolean = false
): PatternExpr | null {
  for (const pattern of patterns) {
    // Check if this pattern is marked as primary
    if (pattern._intent.isPrimary) {
      return pattern
    }
    
    // Recursively check composite patterns
    const def = pattern._intent.def
    if (def.type === 'allOf' || def.type === 'anyOf' || def.type === 'sequence') {
      // For anyOf, only search branches that match
      if (def.type === 'anyOf') {
        if (!frame) {
          // Fall through to search all branches
        } else {
          for (const subPattern of def.patterns) {
            const matches = matchPatternExpr(frame, subPattern)
            
            // Only search this branch if it matches
            if (matches) {
              const nested = findPrimaryPattern([subPattern], frame, true)
              if (nested) {
                return nested
              }
            }
          }
          // Checked all branches, none had a primary
          continue
        }
      }
      
      // For allOf and sequence, search all patterns
      // But if we're inside an anyOf and this allOf doesn't match, skip it
      if ((def.type === 'allOf' || def.type === 'sequence') && isInsideAnyOf && frame) {
        const matches = matchPatternExpr(frame, pattern)
        if (!matches) {
          continue
        }
      }
      
      const nested = findPrimaryPattern(def.patterns, frame, isInsideAnyOf)
      if (nested) {
        return nested
      }
    }
  }
  
  return null
}

/**
 * Calculate gesture-specific position based on pattern type.
 * Different gestures use different reference points for better UX.
 */
export function calculateGesturePosition(
  def: PatternDef,
  landmarks: Array<{ x: number; y: number; z: number }>,
  frame?: FrameSnapshot
): Position {
  switch (def.type) {
    case 'pinch': {
      // Midpoint between fingertip and thumb
      const thumbTip = landmarks[4]
      const fingerTip = getFingertipLandmark(landmarks, def.finger)
      return {
        x: (thumbTip.x + fingerTip.x) / 2,
        y: (thumbTip.y + fingerTip.y) / 2,
        z: (thumbTip.z + fingerTip.z) / 2,
      }
    }
    case 'gesture': {
      return calculateGestureSpecificPosition(def.gesture, landmarks)
    }
    case 'anyOf':
    case 'allOf':
    case 'sequence': {
      // First, try to find a pattern marked with .primary()
      // For anyOf patterns, pass frame so we only search the matching branch
      const primaryPattern = findPrimaryPattern(def.patterns, frame)
      if (primaryPattern) {
        return calculateGesturePosition(primaryPattern._intent.def, landmarks, frame)
      }
      
      // Legacy: check primaryIndex
      if (def.primaryIndex !== undefined && def.patterns[def.primaryIndex]) {
        const indexedPrimary = def.patterns[def.primaryIndex]
        return calculateGesturePosition(indexedPrimary._intent.def, landmarks, frame)
      }
      
      // Otherwise use wrist (default)
      return landmarks[0]
    }
  }
}

/**
 * Calculate position for a specific gesture type.
 */
function calculateGestureSpecificPosition(
  gesture: GestureName,
  landmarks: Array<{ x: number; y: number; z: number }>
): Position {
  switch (gesture) {
    case 'Closed_Fist':
    case 'Open_Palm': {
      // Center of palm - average of wrist (0) and base of each finger (5, 9, 13, 17)
      const wrist = landmarks[0]
      const indexBase = landmarks[5]
      const middleBase = landmarks[9]
      const ringBase = landmarks[13]
      const pinkyBase = landmarks[17]
      return {
        x: (wrist.x + indexBase.x + middleBase.x + ringBase.x + pinkyBase.x) / 5,
        y: (wrist.y + indexBase.y + middleBase.y + ringBase.y + pinkyBase.y) / 5,
        z: (wrist.z + indexBase.z + middleBase.z + ringBase.z + pinkyBase.z) / 5,
      }
    }

    case 'Pointing_Up':
      // Index fingertip
      return landmarks[8]

    case 'Thumb_Up':
    case 'Thumb_Down':
      // Thumb tip
      return landmarks[4]

    case 'Victory': {
      // Midpoint between index and middle fingertips
      // This creates a natural spawn point between the two fingers
      // for particle effects - feels more intuitive than palm center
      const indexTip = landmarks[8]
      const middleTip = landmarks[12]
      return {
        x: (indexTip.x + middleTip.x) / 2,
        y: (indexTip.y + middleTip.y) / 2,
        z: (indexTip.z + middleTip.z) / 2,
      }
    }

    case 'ILoveYou':
      // Center of palm (default)
      return landmarks[0]

    default:
      return landmarks[0]
  }
}

/**
 * Get fingertip landmark for a specific finger.
 */
function getFingertipLandmark(
  landmarks: Array<{ x: number; y: number; z: number }>,
  finger: string
): { x: number; y: number; z: number } {
  switch (finger) {
    case 'index': return landmarks[8]
    case 'middle': return landmarks[12]
    case 'ring': return landmarks[16]
    case 'pinky': return landmarks[20]
    default: return landmarks[8]
  }
}

/**
 * Extract ALL matching hands from a pattern.
 * 
 * For composite patterns (anyOf/allOf) with .primary(), returns only the primary hand.
 * For simple patterns with 'any' hand, returns ALL hands that match the pattern.
 * For patterns with specific hand ('left'|'right'), returns only matching hands.
 * 
 * This enables one intent definition to spawn multiple concurrent actions (one per hand).
 */
export function extractAllMatchingHands(
  frame: FrameSnapshot,
  pattern: PatternExpr
): Array<{
  hand: 'left' | 'right'
  handIndex: number
  headIndex: number
  landmarks: Array<{ x: number; y: number; z: number }>
  position: Position
}> {
  const def = pattern._intent.def
  const gestureResult = frame.gestureResult

  if (!gestureResult?.hands || gestureResult.hands.length === 0) {
    return []
  }

  // console.log('[extractAllMatchingHands] pattern type:', def.type, 'hand:', 'hand' in def ? def.hand : 'N/A')

  // For composite patterns (allOf/anyOf/sequence), check if we should extract all hands or just primary
  if (def.type === 'anyOf' || def.type === 'allOf' || def.type === 'sequence') {
    // Special case for anyOf: if the matching branch is a simple pattern with 'any' hand,
    // extract all matching hands instead of just the primary
    if (def.type === 'anyOf') {
      // Find which branch actually matches
      for (const branchPattern of def.patterns) {
        const branchDef = branchPattern._intent.def
        const branchMatches = matchPatternExpr(frame, branchPattern)
        
        if (branchMatches) {
          // Check if this branch is a simple pattern with 'any' hand
          const isSimpleAnyPattern = 
            (branchDef.type === 'gesture' || branchDef.type === 'pinch') &&
            'hand' in branchDef &&
            branchDef.hand === 'any'
          
          if (isSimpleAnyPattern) {
            // console.log('[extractAllMatchingHands] anyOf matched simple "any" pattern, extracting all hands')
            // Extract all hands that match this simple pattern
            return extractAllMatchingHands(frame, branchPattern)
          }
          
          // Otherwise, treat as composite (only extract primary hand)
          break
        }
      }
    }
    
    // Default composite behavior: return only the primary hand
    // console.log('[extractAllMatchingHands] treating as composite, extracting primary hand only')
    const singleHand = extractMatchedHandFromPattern(frame, pattern)
    if (!singleHand) return []
    
    // Add headIndex from the frame data
    const frameHand = gestureResult.hands.find(
      h => h.handIndex === singleHand.handIndex
    )
    
    return [{
      ...singleHand,
      headIndex: frameHand?.headIndex ?? 0
    }]
  }

  // console.log('[extractAllMatchingHands] treating as simple pattern, extracting all matching hands. Frame has', gestureResult.hands.length, 'hands')

  // For simple patterns (gesture/pinch), extract ALL matching hands
  const matchingHands: Array<{
    hand: 'left' | 'right'
    handIndex: number
    headIndex: number
    landmarks: Array<{ x: number; y: number; z: number }>
    position: Position
  }> = []

  // console.log('[extractAllMatchingHands] all hands in frame:', gestureResult.hands.map(h => ({ handedness: h.handedness, handIndex: h.handIndex, gesture: h.gesture, score: h.gestureScore })))

  for (const hand of gestureResult.hands) {
    const handedness = hand.handedness.toLowerCase() as 'left' | 'right'
    // console.log('[extractAllMatchingHands] iterating hand - raw handedness:', hand.handedness, 'normalized:', handedness, 'handIndex:', hand.handIndex)

    // Check if this hand matches the pattern's hand requirement
    if ('hand' in def && !matchesHand(handedness, def.hand)) {
      // console.log('[extractAllMatchingHands] hand', handedness, 'does not match requirement:', def.hand)
      continue
    }

    // For gesture patterns, verify the gesture matches
    if (def.type === 'gesture') {
      const gestureDef = def
      
      if (
        hand.gesture === gestureDef.gesture &&
        hand.gestureScore >= gestureDef.confidence
      ) {
        const position = calculateGesturePosition(def, hand.landmarks)
        matchingHands.push({
          hand: handedness,
          handIndex: hand.handIndex,
          headIndex: hand.headIndex ?? 0,
          landmarks: hand.landmarks,
          position,
        })
      }
      continue
    }

    // For pinch patterns, verify the pinch matches
    if (def.type === 'pinch') {
      const pinchDef = def
      if (hand.landmarks && hand.landmarks.length >= 21) {
        const distance = calculatePinchDistance(hand.landmarks, pinchDef.finger)
        if (distance <= pinchDef.threshold) {
          const position = calculateGesturePosition(def, hand.landmarks)
          matchingHands.push({
            hand: handedness,
            handIndex: hand.handIndex,
            headIndex: hand.headIndex ?? 0,
            landmarks: hand.landmarks,
            position,
          })
        }
      }
      continue
    }
  }

  return matchingHands
}

/**
 * Extract matched hand information from frame based on pattern.
 * Used by the engine to get position data.
 * 
 * For composite patterns (allOf/anyOf/sequence), this returns the "primary" hand
 * which is determined by finding the first sub-pattern with a specific hand requirement.
 * 
 * NOTE: This is kept for backward compatibility. New code should use extractAllMatchingHands().
 */
export function extractMatchedHandFromPattern(
  frame: FrameSnapshot,
  pattern: PatternExpr
): {
  hand: 'left' | 'right'
  handIndex: number
  landmarks: Array<{ x: number; y: number; z: number }>
  position: Position
} | null {
  const def = pattern._intent.def
  const gestureResult = frame.gestureResult

  if (!gestureResult?.hands || gestureResult.hands.length === 0) {
    return null
  }

  // For composite patterns (allOf/anyOf/sequence), we need to find the "action" hand
  // The action hand is determined by finding the primary pattern
  if (def.type === 'anyOf' || def.type === 'allOf' || def.type === 'sequence') {
    // First, verify the full pattern matches with all hands
    if (!matchPatternDef(frame, def)) {
      return null
    }

    // Find the "primary" hand
    let primaryHand: typeof gestureResult.hands[0] | null = null
    let primaryHandedness: 'left' | 'right' | null = null

    // Look for right hand first (typically the action hand in two-hand patterns)
    const rightHand = gestureResult.hands.find(h => h.handedness.toLowerCase() === 'right')
    const leftHand = gestureResult.hands.find(h => h.handedness.toLowerCase() === 'left')

    // First, try to find a pattern marked with .primary()
    // Pass frame so anyOf patterns only search matching branches
    const primaryPattern = findPrimaryPattern([pattern], frame)
    
    if (primaryPattern) {
      const primaryDef = primaryPattern._intent.def
      if ('hand' in primaryDef && primaryDef.hand !== 'any') {
        primaryHandedness = primaryDef.hand
        primaryHand = (primaryHandedness === 'right' ? rightHand : leftHand) ?? null
      }
    }
    
    // Legacy: If primaryIndex is specified, use that sub-pattern to determine the hand
    if (!primaryHand && def.primaryIndex !== undefined && def.patterns[def.primaryIndex]) {
      const indexedPrimary = def.patterns[def.primaryIndex]._intent.def

      if ('hand' in indexedPrimary && indexedPrimary.hand !== 'any') {
        // Use the specific hand required by the primary pattern
        primaryHandedness = indexedPrimary.hand
        primaryHand = (primaryHandedness === 'right' ? rightHand : leftHand) ?? null
      }
    }

    // If no primary pattern found, use heuristics
    if (!primaryHand) {
      // Check if any sub-pattern specifically requires right hand
      const hasRightHandPattern = def.patterns.some(p => {
        const subDef = p._intent.def
        return 'hand' in subDef && subDef.hand === 'right'
      })

      // Check if any sub-pattern specifically requires left hand
      const hasLeftHandPattern = def.patterns.some(p => {
        const subDef = p._intent.def
        return 'hand' in subDef && subDef.hand === 'left'
      })

      // Prefer right hand for action if it exists and is required by a sub-pattern
      if (hasRightHandPattern && rightHand) {
        primaryHand = rightHand
      } else if (hasLeftHandPattern && leftHand) {
        primaryHand = leftHand
      } else if (rightHand) {
        primaryHand = rightHand
      } else if (leftHand) {
        primaryHand = leftHand
      } else if (gestureResult.hands.length > 0) {
        primaryHand = gestureResult.hands[0]
      }
    }

    if (!primaryHand) {
      return null
    }

    const handedness = primaryHand.handedness.toLowerCase() as 'left' | 'right'
    const position = calculateGesturePosition(def, primaryHand.landmarks, frame)

    return {
      hand: handedness,
      handIndex: primaryHand.handIndex,
      landmarks: primaryHand.landmarks,
      position,
    }
  }

  // Find the first matching hand for simple patterns
  for (const hand of gestureResult.hands) {
    const handedness = hand.handedness.toLowerCase() as 'left' | 'right'

    // Check if this hand matches the pattern's hand requirement
    if ('hand' in def && !matchesHand(handedness, def.hand)) {
      continue
    }

    // For gesture patterns, verify the gesture matches
    if (def.type === 'gesture') {
      const gestureDef = def
      if (
        hand.gesture === gestureDef.gesture &&
        hand.gestureScore >= gestureDef.confidence
      ) {
        const position = calculateGesturePosition(def, hand.landmarks)
        return {
          hand: handedness,
          handIndex: hand.handIndex,
          landmarks: hand.landmarks,
          position,
        }
      }
      continue
    }

    // For pinch patterns, verify the pinch matches
    if (def.type === 'pinch') {
      const pinchDef = def
      if (hand.landmarks && hand.landmarks.length >= 21) {
        const distance = calculatePinchDistance(hand.landmarks, pinchDef.finger)
        if (distance <= pinchDef.threshold) {
          const position = calculateGesturePosition(def, hand.landmarks)
          return {
            hand: handedness,
            handIndex: hand.handIndex,
            landmarks: hand.landmarks,
            position,
          }
        }
      }
      continue
    }
  }

  return null
}

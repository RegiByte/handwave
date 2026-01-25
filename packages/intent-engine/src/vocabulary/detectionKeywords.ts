/**
 * Detection Keywords
 *
 * Single source of truth for all detection-related constants.
 * These define the canonical vocabulary for all detection data across adapters.
 *
 * Philosophy:
 * - No magic strings anywhere in the codebase
 * - Adapters transform native types → canonical vocabulary
 * - All consumers use these constants
 */

export const detectionKeywords = {
  /**
   * Detector types (pluggable)
   * Each detector type represents a different detection capability
   */
  detectorTypes: {
    hand: 'hand',
    face: 'face',
    body: 'body', // future
    eye: 'eye', // future
  },

  /**
   * Hand handedness (left/right/unknown)
   * Normalized to lowercase for consistency
   */
  handedness: {
    left: 'left',
    right: 'right',
    unknown: 'unknown',
  },

  /**
   * Standard gesture names (MediaPipe gesture set)
   * These are the canonical gesture names used throughout the system
   */
  gestures: {
    none: 'None',
    closedFist: 'Closed_Fist',
    openPalm: 'Open_Palm',
    pointingUp: 'Pointing_Up',
    thumbUp: 'Thumb_Up',
    thumbDown: 'Thumb_Down',
    victory: 'Victory',
    iLoveYou: 'ILoveYou',
  },

  /**
   * Hand landmark indices (MediaPipe 21-point hand model)
   * These indices are stable across all hand detection adapters
   */
  handLandmarks: {
    wrist: 0,
    thumbCMC: 1,
    thumbMCP: 2,
    thumbIP: 3,
    thumbTip: 4,
    indexMCP: 5,
    indexPIP: 6,
    indexDIP: 7,
    indexTip: 8,
    middleMCP: 9,
    middlePIP: 10,
    middleDIP: 11,
    middleTip: 12,
    ringMCP: 13,
    ringPIP: 14,
    ringDIP: 15,
    ringTip: 16,
    pinkyMCP: 17,
    pinkyPIP: 18,
    pinkyDIP: 19,
    pinkyTip: 20,
  },

  /**
   * Common face blendshape names (subset)
   * These are the most commonly used blendshapes
   * Adapters may provide additional blendshapes not listed here
   */
  faceBlendshapes: {
    neutral: '_neutral',
    browDownLeft: 'browDownLeft',
    browDownRight: 'browDownRight',
    browInnerUp: 'browInnerUp',
    browOuterUpLeft: 'browOuterUpLeft',
    browOuterUpRight: 'browOuterUpRight',
    eyeBlinkLeft: 'eyeBlinkLeft',
    eyeBlinkRight: 'eyeBlinkRight',
    eyeSquintLeft: 'eyeSquintLeft',
    eyeSquintRight: 'eyeSquintRight',
    eyeWideLeft: 'eyeWideLeft',
    eyeWideRight: 'eyeWideRight',
    jawOpen: 'jawOpen',
    jawForward: 'jawForward',
    jawLeft: 'jawLeft',
    jawRight: 'jawRight',
    mouthClose: 'mouthClose',
    mouthFunnel: 'mouthFunnel',
    mouthPucker: 'mouthPucker',
    mouthLeft: 'mouthLeft',
    mouthRight: 'mouthRight',
    mouthSmileLeft: 'mouthSmileLeft',
    mouthSmileRight: 'mouthSmileRight',
    mouthFrownLeft: 'mouthFrownLeft',
    mouthFrownRight: 'mouthFrownRight',
    // Note: Adapters may provide additional blendshapes
    // This is not an exhaustive list
  },
} as const

// ============================================================================
// Type Exports (for TypeScript type checking)
// ============================================================================

export type DetectorType =
  (typeof detectionKeywords.detectorTypes)[keyof typeof detectionKeywords.detectorTypes]

export type Handedness =
  (typeof detectionKeywords.handedness)[keyof typeof detectionKeywords.handedness]

export type DetectionGestureName =
  (typeof detectionKeywords.gestures)[keyof typeof detectionKeywords.gestures]

export type HandLandmarkIndex =
  (typeof detectionKeywords.handLandmarks)[keyof typeof detectionKeywords.handLandmarks]

export type FaceBlendshapeName =
  (typeof detectionKeywords.faceBlendshapes)[keyof typeof detectionKeywords.faceBlendshapes]

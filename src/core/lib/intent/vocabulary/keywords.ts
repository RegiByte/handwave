/**
 * Intent Engine Keywords
 *
 * Centralized string constants for the Intent Engine system.
 * All command, event, and type strings are defined here to prevent drift.
 *
 * Philosophy: No magic strings, no drift, single source of truth.
 */

export const intentKeywords = {
  // ============================================================================
  // Gesture Names (MediaPipe Gesture Recognizer)
  // ============================================================================
  gestures: {
    closedFist: 'Closed_Fist',
    openPalm: 'Open_Palm',
    pointingUp: 'Pointing_Up',
    thumbUp: 'Thumb_Up',
    thumbDown: 'Thumb_Down',
    victory: 'Victory',
    iLoveYou: 'ILoveYou',
    none: 'None',
  },

  // ============================================================================
  // Hand Identifiers
  // ============================================================================
  hands: {
    left: 'left',
    right: 'right',
  },

  // ============================================================================
  // Finger Names
  // ============================================================================
  fingers: {
    thumb: 'thumb',
    index: 'index',
    middle: 'middle',
    ring: 'ring',
    pinky: 'pinky',
  },

  // ============================================================================
  // Contact Types
  // ============================================================================
  contactTypes: {
    pinch: 'pinch',
    touch: 'touch',
  },

  // ============================================================================
  // Action Lifecycle States
  // ============================================================================
  actionStates: {
    pending: 'pending',
    active: 'active',
    ending: 'ending',
  },

  // ============================================================================
  // End Reasons (why an action ended)
  // ============================================================================
  endReasons: {
    completed: 'completed',
    cancelled: 'cancelled',
    timeout: 'timeout',
  },

  // ============================================================================
  // Coordinate Systems
  // ============================================================================
  coordinateSystems: {
    normalized: 'normalized',
    viewport: 'viewport',
    screen: 'screen',
  },

  // ============================================================================
  // Intent Event Types (suffixes)
  // ============================================================================
  eventSuffixes: {
    start: 'start',
    update: 'update',
    end: 'end',
  },

  // ============================================================================
  // Pattern Types (for intent matching)
  // ============================================================================
  patternTypes: {
    gesture: 'gesture',
    contact: 'contact',
  },

  // ============================================================================
  // Grid Resolutions
  // ============================================================================
  gridResolutions: {
    coarse: 'coarse',
    medium: 'medium',
    fine: 'fine',
  },

  // ============================================================================
  // Recording System
  // ============================================================================
  recording: {
    commands: {
      startRecording: 'recording/start',
      stopRecording: 'recording/stop',
      exportRecording: 'recording/export',
      clearBuffer: 'recording/clear',
    },
    events: {
      recordingStarted: 'recording/started',
      recordingStopped: 'recording/stopped',
      frameRecorded: 'recording/frameRecorded',
    },
  },
} as const

// ============================================================================
// Type Exports (for TypeScript inference)
// ============================================================================

export type GestureName = (typeof intentKeywords.gestures)[keyof typeof intentKeywords.gestures]
export type HandIdentifier = (typeof intentKeywords.hands)[keyof typeof intentKeywords.hands]
export type FingerName = (typeof intentKeywords.fingers)[keyof typeof intentKeywords.fingers]
export type ContactType = (typeof intentKeywords.contactTypes)[keyof typeof intentKeywords.contactTypes]
export type ActionState = (typeof intentKeywords.actionStates)[keyof typeof intentKeywords.actionStates]
export type CoordinateSystem = (typeof intentKeywords.coordinateSystems)[keyof typeof intentKeywords.coordinateSystems]
export type EventSuffix = (typeof intentKeywords.eventSuffixes)[keyof typeof intentKeywords.eventSuffixes]
export type PatternType = (typeof intentKeywords.patternTypes)[keyof typeof intentKeywords.patternTypes]


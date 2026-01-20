/**
 * Intent Engine - Public API
 *
 * Main entry point for the Intent Engine library.
 * Exports all public types, functions, and utilities.
 *
 * Philosophy:
 * - Everything is exposed for transparency
 * - Clear, organized exports
 * - Type-safe by default
 */

// ============================================================================
// Vocabulary (Keywords & Schemas)
// ============================================================================

export * from './vocabulary'

// ============================================================================
// Core Types
// ============================================================================

export * from './core/types'

// ============================================================================
// DSL (Intent Definition)
// ============================================================================

// Export DSL builders and functions
export {
  gesture,
  pinch,
  anyOf,
  allOf,
  gestures,
  pinches,
  intent,
  isIntent,
  getIntentDef,
  getEventTypes,
  matchPatternExpr,
  matchPatternDef,
  extractMatchedHandFromPattern,
  processFrameV2,
  createSubscriptionManager,
  intentEngineResource,
  calculateGesturePosition,
} from './dsl'

// Export DSL types (these may overlap with vocabulary, but DSL takes precedence)
export type {
  PatternDef,
  GesturePatternDef,
  PinchPatternDef,
  CompositePatternDef,
  PatternExpr,
  PatternExprInternals,
  GestureExpr,
  PinchExpr,
  SomePatternExpr,
  ResolutionConfig,
  IntentDef,
  IntentEventDescriptor,
  StandardEventBase,
  StandardStartEvent,
  StandardUpdateEvent,
  StandardEndEvent,
  StandardIntentEvents,
  IntentId,
  IntentEvents,
  IntentStartEvent,
  IntentUpdateEvent,
  IntentEndEvent,
  DescriptorEvent,
  EventCallback,
  Unsubscribe,
  IntentEngineAPI,
} from './dsl'

// ============================================================================
// Core Functions (Frame History)
// ============================================================================

export {
  addFrame,
  getLatestFrame,
  getFrameAgo,
  getFramesInWindow,
  checkHeldFor,
  checkAnyInWindow,
  getContinuousDuration,
  calculateVelocity,
  calculateAverageVelocity,
  getHistoryDuration,
  getAverageFPS,
} from './core/frameHistory'

// ============================================================================
// Core Functions (Action Tracker)
// ============================================================================

export {
  generateActionId,
  shouldStartAction,
  shouldContinueAction,
  determineEndReason,
  createActionContext,
  transitionToActive,
  updateAction,
  transitionToEnding,
  addAction,
  removeAction,
  updateActionInMap,
  getActionsForIntent,
  getActionsByState,
} from './core/actionTracker'

// ============================================================================
// Core Functions (Intent Engine)
// ============================================================================

export {
  processFrame,
  matchesIntent,
  findMatchingIntents,
  generateStartEvent,
  generateUpdateEvent,
  generateEndEvent,
  resolveConflicts,
  isIntentActive,
  getActiveActionForIntent,
} from './core/intentEngine'

// ============================================================================
// Matching Functions
// ============================================================================

export {
  matchesGesture,
  getGestureForHand,
  getHandedness,
  getAllGestures,
  isValidGesture,
  normalizeGestureName,
} from './matching/gestureMatcher'

export {
  matchesContact,
  detectPinch,
  detectMultiFingerContact,
  calculateDistance3D,
  calculateDistance2D,
  getLandmarkForFinger,
  getLandmarksForHand,
  areValidLandmarks,
  getFingertips,
  FINGERTIP_INDICES,
} from './matching/contactDetector'

export {
  isInCell,
  isInAnyCells,
  isInRegion,
  isInCircle,
  isInSphere,
  arePositionsClose,
  isCloseToAny,
} from './matching/spatialMatcher'

// ============================================================================
// Spatial Functions (Grid)
// ============================================================================

export {
  normalizedToCell,
  cellToNormalized,
  getCellCenter,
  getCellBounds,
  getCellDimensions,
  isValidCell,
  clampCell,
  getNeighborCells,
  getCardinalNeighbors,
  cellsEqual,
  cellManhattanDistance,
  cellEuclideanDistance,
  createSpatialHash,
} from './spatial/grid'

export type {
  PositionedItem,
  ItemWithDistance,
  SpatialHash,
} from './spatial/grid'

// ============================================================================
// Spatial Functions (Hysteresis)
// ============================================================================

export {
  createHysteresisState,
  updateHysteresis,
  shouldSwitchCell,
  calculateDistanceFromCenter,
  getStableCell,
  isPositionStable,
  resetHysteresis,
} from './spatial/hysteresis'

// ============================================================================
// Spatial Functions (Coordinates)
// ============================================================================

export {
  transformCoordinates,
  normalizedToViewport,
  viewportToNormalized,
  normalizedToScreen,
  screenToNormalized,
  applyMirroring,
  removeMirroring,
  clampNormalized,
  isNormalizedInBounds,
  isInViewport,
  getAspectRatio,
} from './spatial/coordinates'

// ============================================================================
// Gesture Calibration
// ============================================================================

export {
  normalizeGestureConfidence,
  meetsGestureThreshold,
  getGestureThreshold,
  getGestureCalibration,
  getAllCalibrations,
  compareGestureConfidence,
  filterByQuality,
  GESTURE_CALIBRATIONS,
} from './matching/gestureCalibration'
export type {
  GestureCalibration,
  NormalizedConfidence,
} from './matching/gestureCalibration'

// ============================================================================
// Pinch Calibration
// ============================================================================

export {
  getPinchThreshold,
  getAllPinchThresholds,
  getPinchCalibration,
  getAllPinchCalibrations,
  meetsPinchThreshold,
  normalizePinchDistance,
  getPinchQuality,
  createPinchThresholds,
  DEFAULT_PINCH_THRESHOLDS,
  PINCH_CALIBRATIONS,
} from './matching/pinchCalibration'
export type {
  PinchCalibration,
  FingerName as PinchFingerName,
} from './matching/pinchCalibration'

// ============================================================================
// Resources (Braided)
// ============================================================================

export { frameHistoryResource } from './resources/frameHistoryResource'
export type { FrameHistoryAPI } from './resources/frameHistoryResource'
export { recordingResource } from './resources/recordingResource'
export type { RecordingResource } from './resources/recordingResource'

// ============================================================================
// Testing Utilities
// ============================================================================

export * from './testing'

// ============================================================================
// React Hooks
// ============================================================================

export {
  useIntentEngine,
  useIntentEvent,
  useIntentEvents,
  useActiveActions,
  useFrameHistory,
  useAction,
} from './resources/hooks'

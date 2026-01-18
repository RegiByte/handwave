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

export { defineIntent, createEventBuilder, createEndEventBuilder } from './dsl/defineIntent'
export { createIntentEngine, createDefaultConfig, mergeConfigs } from './dsl/createEngine'

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
// Resources (Braided)
// ============================================================================

export { intentEngineResource } from './resources/intentEngineResource'

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


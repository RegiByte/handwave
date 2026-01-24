/**
 * Core Module
 * 
 * Engine orchestration, frame history, and action lifecycle management.
 */

// Frame History
export {
  addFrame,
  calculateAverageVelocity,
  calculateVelocity,
  checkAnyInWindow,
  checkHeldFor,
  getAverageFPS,
  getContinuousDuration,
  getFrameAgo,
  getFramesInWindow,
  getHistoryDuration,
  getLatestFrame,
} from './frameHistory'

// Action Tracker
export {
  addAction,
  createActionContext,
  determineEndReason,
  generateActionId,
  getActionsByState,
  getActionsForIntent,
  removeAction,
  shouldContinueAction,
  shouldStartAction,
  transitionToActive,
  transitionToEnding,
  updateAction,
  updateActionInMap,
} from './actionTracker'

// Intent Engine (legacy - kept for backward compatibility, but use DSL versions)
// Note: These are OLD implementations. Use processFrameV2 from DSL module instead.
export {
  findMatchingIntents,
  generateEndEvent,
  generateStartEvent,
  generateUpdateEvent,
  getActiveActionForIntent,
  isIntentActive,
  matchesIntent,
  processFrame,
  resolveConflicts,
} from './intentEngine'

// Types
export type {
  FrameProcessingResult,
  // Note: Intent type from core is OLD (with lifecycle hooks)
  // Use Intent type from DSL module instead (declarative, no handlers)
  Intent as LegacyIntent,
  IntentEngine,
  IntentEventCallback,
  UnsubscribeFn,
  Expand,
} from './types'

export {
  isContactPattern,
  isGesturePattern,
} from './types'

// Invariant utility
export { invariant } from './invariant'

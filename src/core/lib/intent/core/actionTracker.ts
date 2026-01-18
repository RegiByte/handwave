/**
 * Intent Engine - Action Tracker
 *
 * Manages the lifecycle of active actions (pending → active → ending).
 *
 * Responsibilities:
 * - Track active actions with stable IDs
 * - Manage action lifecycle transitions
 * - Generate deterministic action IDs
 * - Check start/continue conditions
 * - Handle cancellation
 *
 * Philosophy:
 * - Pure functions for logic, atoms for state
 * - Stable IDs enable correlation and replay
 * - Deterministic behavior for testing
 */

import type {
  ActionContext,
  ActiveAction,
  EndReason,
  FrameSnapshot,
  Intent,
} from './types'
import { intentKeywords } from '@/core/lib/intent/vocabulary'

// ============================================================================
// Action ID Generation
// ============================================================================

/**
 * Generate a stable, unique action ID
 *
 * Includes hand index to ensure uniqueness when multiple hands trigger the same intent.
 *
 * @param intentId - Intent identifier
 * @param hand - Hand identifier ('left' or 'right')
 * @param handIndex - Hand instance index (0-3)
 * @param timestamp - Start timestamp
 * @returns Deterministic action ID (format: intentId_hand_handIndex_timestamp)
 */
export function generateActionId(
  intentId: string,
  hand: 'left' | 'right',
  handIndex: number,
  timestamp: number
): string {
  return `${intentId}_${hand}_${handIndex}_${timestamp}`
}

// ============================================================================
// Action Lifecycle Checks
// ============================================================================

/**
 * Check if an intent's conditions are met to start an action
 *
 * @param intent - Intent definition
 * @param frame - Current frame
 * @param history - Frame history
 * @returns True if conditions are met
 */
export function shouldStartAction(
  intent: Intent,
  frame: FrameSnapshot,
  history: Array<FrameSnapshot>
): boolean {
  // TODO: Implement in Phase 3
  // - Check modifier pattern (if present)
  // - Check action pattern
  // - Check temporal constraints (minDuration)
  return false
}

/**
 * Check if an active action should continue
 *
 * @param action - Active action
 * @param intent - Intent definition
 * @param frame - Current frame
 * @returns True if action should continue
 */
export function shouldContinueAction(
  action: ActiveAction,
  intent: Intent,
  frame: FrameSnapshot
): boolean {
  // TODO: Implement in Phase 3
  // - Check if modifier still matches (if present)
  // - Check if action still matches
  // - Check temporal constraints (maxGap)
  return false
}

/**
 * Determine why an action ended
 *
 * @param action - Active action
 * @param intent - Intent definition
 * @param frame - Current frame
 * @returns End reason
 */
export function determineEndReason(
  action: ActiveAction,
  intent: Intent,
  frame: FrameSnapshot
): EndReason {
  // TODO: Implement in Phase 3
  // - Check if modifier changed → 'cancelled'
  // - Check if tracking lost → 'timeout'
  // - Otherwise → 'completed'
  return intentKeywords.endReasons.completed as EndReason
}

// ============================================================================
// Action Context Creation
// ============================================================================

/**
 * Create action context from current state
 *
 * @param action - Active action
 * @param frame - Current frame
 * @param position - Current position
 * @param cell - Current grid cell
 * @param velocity - Current velocity
 * @returns Action context
 */
export function createActionContext(
  action: ActiveAction,
  frame: FrameSnapshot,
  position: { x: number; y: number; z: number },
  cell: { col: number; row: number },
  velocity: { x: number; y: number; z: number }
): ActionContext {
  return {
    actionId: action.id,
    intentId: action.intentId,
    hand: action.context.hand,
    handIndex: action.context.handIndex,
    position,
    cell,
    velocity,
    timestamp: frame.timestamp,
    duration: frame.timestamp - action.startTime,
  }
}

// ============================================================================
// Action State Transitions
// ============================================================================

/**
 * Transition action from pending to active
 *
 * @param action - Active action in pending state
 * @param timestamp - Current timestamp
 * @returns Updated action
 */
export function transitionToActive(
  action: ActiveAction,
  timestamp: number
): ActiveAction {
  return {
    ...action,
    state: intentKeywords.actionStates.active as ActiveAction['state'],
    lastUpdateTime: timestamp,
  }
}

/**
 * Update an active action
 *
 * @param action - Active action
 * @param context - New action context
 * @returns Updated action
 */
export function updateAction(
  action: ActiveAction,
  context: ActionContext
): ActiveAction {
  return {
    ...action,
    lastUpdateTime: context.timestamp,
    context,
  }
}

/**
 * Transition action to ending state
 *
 * @param action - Active action
 * @param timestamp - Current timestamp
 * @returns Updated action
 */
export function transitionToEnding(
  action: ActiveAction,
  timestamp: number
): ActiveAction {
  return {
    ...action,
    state: intentKeywords.actionStates.ending as ActiveAction['state'],
    lastUpdateTime: timestamp,
  }
}

// ============================================================================
// Action Map Utilities
// ============================================================================

/**
 * Add an action to the active actions map
 *
 * @param actions - Current actions map
 * @param action - Action to add
 * @returns New actions map (immutable)
 */
export function addAction(
  actions: Map<string, ActiveAction>,
  action: ActiveAction
): Map<string, ActiveAction> {
  const newActions = new Map(actions)
  newActions.set(action.id, action)
  return newActions
}

/**
 * Remove an action from the active actions map
 *
 * @param actions - Current actions map
 * @param actionId - Action ID to remove
 * @returns New actions map (immutable)
 */
export function removeAction(
  actions: Map<string, ActiveAction>,
  actionId: string
): Map<string, ActiveAction> {
  const newActions = new Map(actions)
  newActions.delete(actionId)
  return newActions
}

/**
 * Update an action in the active actions map
 *
 * @param actions - Current actions map
 * @param actionId - Action ID to update
 * @param updater - Function to update the action
 * @returns New actions map (immutable)
 */
export function updateActionInMap(
  actions: Map<string, ActiveAction>,
  actionId: string,
  updater: (action: ActiveAction) => ActiveAction
): Map<string, ActiveAction> {
  const action = actions.get(actionId)
  if (!action) return actions

  const newActions = new Map(actions)
  newActions.set(actionId, updater(action))
  return newActions
}

/**
 * Get all actions for a specific intent
 *
 * @param actions - Active actions map
 * @param intentId - Intent ID to filter by
 * @returns Array of actions
 */
export function getActionsForIntent(
  actions: Map<string, ActiveAction>,
  intentId: string
): Array<ActiveAction> {
  return Array.from(actions.values()).filter(
    (action) => action.intentId === intentId
  )
}

/**
 * Get all actions in a specific state
 *
 * @param actions - Active actions map
 * @param state - State to filter by
 * @returns Array of actions
 */
export function getActionsByState(
  actions: Map<string, ActiveAction>,
  state: ActiveAction['state']
): Array<ActiveAction> {
  return Array.from(actions.values()).filter(
    (action) => action.state === state
  )
}


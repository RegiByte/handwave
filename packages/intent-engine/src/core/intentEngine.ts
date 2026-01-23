/**
 * Intent Engine - Core Orchestrator
 *
 * Main engine that processes frames and emits intent events.
 *
 * Responsibilities:
 * - Process frames through the intent pipeline
 * - Match intents against current state
 * - Track action lifecycle
 * - Emit intent events
 * - Coordinate all subsystems
 *
 * Philosophy:
 * - Pure function for frame processing
 * - Atoms for state management
 * - Subscriptions for event distribution
 */

import type { ActiveAction, FrameSnapshot, IntentEngineConfig, IntentEvent, Pattern, Position, Vector3 } from '@handwave/intent-engine';
import { intentKeywords, matchesContact, matchesGesture, normalizedToCell } from '@handwave/intent-engine'
import {
  createActionContext,
  determineEndReason,
  generateActionId,
  shouldStartAction,
  updateAction,
} from './actionTracker'
import { calculateVelocity } from './frameHistory'
import type { FrameProcessingResult, Intent } from './types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract matched hand information from frame based on pattern
 *
 * @param frame - Frame to extract from
 * @param pattern - Pattern that matched
 * @returns Hand info or null if not found
 */
function extractMatchedHand(
  frame: FrameSnapshot,
  pattern: Pattern
): { hand: 'left' | 'right'; handIndex: number; headIndex: number; landmarks: Array<Vector3> } | null {
  const gestureResult = frame.gestureResult
  if (!gestureResult || !gestureResult.hands || gestureResult.hands.length === 0) {
    return null
  }

  // Find matching hand
  const matchingHand = gestureResult.hands.find((h) => {
    const handedness = h.handedness.toLowerCase() as 'left' | 'right'

    // Check handedness matches
    if (handedness !== pattern.hand) {
      return false
    }

    // If handIndex specified in pattern, match ONLY that specific hand instance
    if (pattern.handIndex !== undefined && h.handIndex !== pattern.handIndex) {
      return false
    }

    // Verify pattern actually matches this hand
    // Create a temporary frame with just this hand for matching
    const singleHandFrame: FrameSnapshot = {
      ...frame,
      gestureResult: {
        hands: [h]
      }
    }

    return matchPattern(singleHandFrame, pattern)
  })

  if (!matchingHand) {
    return null
  }

  return {
    hand: matchingHand.handedness.toLowerCase() as 'left' | 'right',
    headIndex: matchingHand.headIndex,
    handIndex: matchingHand.handIndex,
    landmarks: matchingHand.landmarks
  }
}

/**
 * Calculate center of mass from landmarks
 *
 * @param landmarks - Hand landmarks
 * @returns Center position
 */
function calculateCenterOfMass(landmarks: Array<Vector3>): Position {
  if (landmarks.length === 0) {
    return { x: 0, y: 0, z: 0 }
  }

  const sum = landmarks.reduce(
    (acc, lm) => ({
      x: acc.x + lm.x,
      y: acc.y + lm.y,
      z: acc.z + lm.z,
    }),
    { x: 0, y: 0, z: 0 }
  )

  return {
    x: sum.x / landmarks.length,
    y: sum.y / landmarks.length,
    z: sum.z / landmarks.length,
  }
}

// ============================================================================
// Frame Processing (Pure Function)
// ============================================================================

/**
 * Process a single frame through the intent pipeline
 *
 * This is the core pure function that:
 * 1. Checks for new intent matches
 * 2. Updates active actions
 * 3. Checks for action endings
 * 4. Generates events to emit
 *
 * @param frame - Current frame
 * @param history - Frame history
 * @param intents - Intent definitions
 * @param activeActions - Current active actions
 * @param config - Engine configuration
 * @returns Events to emit and updated actions
 */
export function processFrame(
  frame: FrameSnapshot,
  history: Array<FrameSnapshot>,
  intents: Array<Intent>,
  activeActions: Map<string, ActiveAction>,
  config: IntentEngineConfig
): FrameProcessingResult {
  const eventsToEmit: Array<IntentEvent> = []
  const updatedActions = new Map(activeActions)

  // Get grid config (use default if not specified)
  const gridConfig = config.spatial?.grid || { cols: 8, rows: 6 }

  // 1. Update existing active actions
  for (const [actionId, action] of Array.from(updatedActions.entries())) {
    const intent = intents.find(i => i.id === action.intentId)
    if (!intent) {
      // Intent no longer exists, remove action
      updatedActions.delete(actionId)
      continue
    }

    const actionMatches = matchesIntent(intent, frame, history, config)
    const withinMaxGap =
      action.state === intentKeywords.actionStates.active &&
      !!intent.temporal?.maxGap &&
      frame.timestamp - action.lastUpdateTime <= intent.temporal.maxGap

    if (actionMatches) {
      // Continue action - update context
      const handInfo = extractMatchedHand(frame, intent.action)
      if (!handInfo) {
        if (action.state === intentKeywords.actionStates.pending) {
          updatedActions.delete(actionId)
          continue
        }

        const reason = determineEndReason(action, intent, frame)
        eventsToEmit.push(generateEndEvent(intent, action, reason))
        updatedActions.delete(actionId)
        continue
      }

      const position = calculateCenterOfMass(handInfo.landmarks)
      const cell = normalizedToCell(position, gridConfig)

      const previousFrame = history.length >= 2 ? history[history.length - 2] : null
      let velocity: Vector3 = { x: 0, y: 0, z: 0 }

      if (previousFrame) {
        const vel = calculateVelocity(
          frame,
          previousFrame,
          (f) => {
            const prevHandInfo = extractMatchedHand(f, intent.action)
            return prevHandInfo ? calculateCenterOfMass(prevHandInfo.landmarks) : null
          }
        )
        if (vel) velocity = vel
      }

      const context = createActionContext(
        action,
        frame,
        position,
        cell,
        velocity
      )

      const updatedAction = updateAction(action, context)

      if (
        updatedAction.state === intentKeywords.actionStates.pending &&
        intent.temporal?.minDuration !== undefined &&
        frame.timestamp - updatedAction.startTime >= intent.temporal.minDuration
      ) {
        const activatedAction = {
          ...updatedAction,
          state: intentKeywords.actionStates.active as ActiveAction['state'],
        }
        updatedActions.set(actionId, activatedAction)
        eventsToEmit.push(generateStartEvent(intent, activatedAction))
        continue
      }

      updatedActions.set(actionId, updatedAction)

      if (updatedAction.state === intentKeywords.actionStates.active) {
        eventsToEmit.push(generateUpdateEvent(intent, updatedAction))
      }
      continue
    }

    if (withinMaxGap) {
      updatedActions.set(actionId, action)
      continue
    }

    if (action.state === intentKeywords.actionStates.pending) {
      updatedActions.delete(actionId)
      continue
    }

    const reason = determineEndReason(action, intent, frame)
    eventsToEmit.push(generateEndEvent(intent, action, reason))
    updatedActions.delete(actionId)
  }

  // 2. Check for new intent matches
  for (const intent of intents) {
    // Skip if already active
    if (isIntentActive(intent.id, updatedActions)) continue

    const matchedNow = matchesIntent(intent, frame, history, config)
    if (!matchedNow) continue

    const usesMinDuration = intent.temporal?.minDuration !== undefined

    if (usesMinDuration || shouldStartAction(intent, frame, history)) {
      // Extract hand info from action pattern
      const handInfo = extractMatchedHand(frame, intent.action)
      if (!handInfo) continue // Shouldn't happen, but safety check

      // Calculate position (center of mass)
      const position = calculateCenterOfMass(handInfo.landmarks)

      // Calculate cell
      const cell = normalizedToCell(position, gridConfig)

      // Initial velocity is zero
      const velocity: Vector3 = { x: 0, y: 0, z: 0 }

      // Generate action ID
      const actionId = generateActionId(
        intent.id,
        handInfo.hand,
        handInfo.handIndex,
        frame.timestamp
      )

      // Create action context
      const context = {
        actionId,
        intentId: intent.id,
        hand: handInfo.hand,
        handIndex: handInfo.handIndex, // Which hand instance (0-3)
        headIndex: handInfo.headIndex, // Which person (0-1 for 2 heads)
        position,
        cell,
        velocity,
        timestamp: frame.timestamp,
        duration: 0,
      }

      // Create new action
      const newAction = {
        id: actionId,
        intentId: intent.id,
        state: usesMinDuration
          ? (intentKeywords.actionStates.pending as ActiveAction['state'])
          : (intentKeywords.actionStates.active as ActiveAction['state']),
        startTime: frame.timestamp,
        lastUpdateTime: frame.timestamp,
        context,
      } satisfies ActiveAction

      updatedActions.set(actionId, newAction)

      if (!usesMinDuration) {
        // Emit start event immediately
        eventsToEmit.push(generateStartEvent(intent, newAction))
      }
    }
  }

  return { eventsToEmit, updatedActions }
}

// ============================================================================
// Intent Matching
// ============================================================================

/**
 * Check if an intent matches the current frame
 *
 * @param intent - Intent to check
 * @param frame - Current frame
 * @param history - Frame history
 * @param config - Engine configuration
 * @returns True if intent matches
 */
export function matchesIntent(
  intent: Intent,
  frame: FrameSnapshot,
  _history: Array<FrameSnapshot>,
  _config: IntentEngineConfig
): boolean {
  // 1. Check modifier pattern (if present)
  if (intent.modifier && !matchPattern(frame, intent.modifier)) {
    return false
  }

  // 2. Check action pattern
  if (!matchPattern(frame, intent.action)) {
    return false
  }

  // Note: Temporal constraints (minDuration) are checked in shouldStartAction
  // This function only checks if patterns match in the current frame

  return true
}

/**
 * Match a pattern against a frame (discriminated by type)
 *
 * @param frame - Frame to check
 * @param pattern - Pattern to match
 * @returns True if pattern matches
 */
function matchPattern(frame: FrameSnapshot, pattern: Pattern): boolean {
  switch (pattern.type) {
    case 'gesture':
      return matchesGesture(frame, pattern)
    case 'contact':
      return matchesContact(frame, pattern)
    default: {
      // Exhaustiveness check - TypeScript will error if we miss a case

      return false
    }
  }
}

/**
 * Find all intents that match the current frame
 *
 * @param intents - All intent definitions
 * @param frame - Current frame
 * @param history - Frame history
 * @param config - Engine configuration
 * @returns Array of matching intents
 */
export function findMatchingIntents(
  intents: Array<Intent>,
  frame: FrameSnapshot,
  history: Array<FrameSnapshot>,
  config: IntentEngineConfig
): Array<Intent> {
  return intents.filter((intent) =>
    matchesIntent(intent, frame, history, config)
  )
}

// ============================================================================
// Event Generation
// ============================================================================

/**
 * Generate a start event for an action
 *
 * @param intent - Intent definition
 * @param action - Active action
 * @returns Start event
 */
export function generateStartEvent(
  intent: Intent,
  action: ActiveAction
): IntentEvent {
  return intent.onStart(action.context)
}

/**
 * Generate an update event for an action
 *
 * @param intent - Intent definition
 * @param action - Active action
 * @returns Update event
 */
export function generateUpdateEvent(
  intent: Intent,
  action: ActiveAction
): IntentEvent {
  return intent.onUpdate(action.context)
}

/**
 * Generate an end event for an action
 *
 * @param intent - Intent definition
 * @param action - Active action
 * @param reason - Why the action ended
 * @returns End event
 */
export function generateEndEvent(
  intent: Intent,
  action: ActiveAction,
  reason: string
): IntentEvent {
  return intent.onEnd({
    ...action.context,
    reason: reason as any, // TODO: Type this properly
  })
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Resolve conflicts when multiple intents match
 *
 * Strategy: First intent wins (for now)
 * TODO: Implement priority system in future
 *
 * @param intents - Matching intents
 * @returns Selected intent or null
 */
export function resolveConflicts(intents: Array<Intent>): Intent | null {
  // Simple strategy: first intent wins
  return intents.length > 0 ? intents[0] : null
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an intent is already active
 *
 * @param intentId - Intent ID to check
 * @param activeActions - Current active actions
 * @returns True if intent has an active action
 */
export function isIntentActive(
  intentId: string,
  activeActions: Map<string, ActiveAction>
): boolean {
  return Array.from(activeActions.values()).some(
    (action) => action.intentId === intentId
  )
}

/**
 * Get the active action for an intent
 *
 * @param intentId - Intent ID
 * @param activeActions - Current active actions
 * @returns Active action or null
 */
export function getActiveActionForIntent(
  intentId: string,
  activeActions: Map<string, ActiveAction>
): ActiveAction | null {
  return (
    Array.from(activeActions.values()).find(
      (action) => action.intentId === intentId
    ) || null
  )
}


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

import type {
  ActiveAction,
  FrameProcessingResult,
  FrameSnapshot,
  Intent,
  IntentEngineConfig,
  IntentEvent,
  Pattern,
} from './types'
import { matchesContact } from '@/core/lib/intent/matching/contactDetector'
import { matchesGesture } from '@/core/lib/intent/matching/gestureMatcher'

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
  // TODO: Implement in Phase 3
  // 1. Check each intent for start conditions
  // 2. Update existing active actions
  // 3. Check for action endings
  // 4. Generate events (start/update/end)
  // 5. Return events and updated action map

  return {
    eventsToEmit: [],
    updatedActions: new Map(activeActions),
  }
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
  history: Array<FrameSnapshot>,
  config: IntentEngineConfig
): boolean {
  // TODO: Implement in Phase 3
  // 1. Check modifier pattern (if present) using matchPattern()
  if (intent.modifier && !matchPattern(frame, intent.modifier)) {
    return false
  }

  // 2. Check action pattern using matchPattern()
  if (!matchPattern(frame, intent.action)) {
    return false
  }

  // 3. Check temporal constraints
  // TODO: Implement temporal constraint checking

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
      const _exhaustive: never = pattern
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


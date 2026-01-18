/**
 * Intent Engine - Define Intent (DSL)
 *
 * Type-safe builder for defining intents declaratively.
 *
 * Responsibilities:
 * - Provide type-safe intent builder
 * - Validate intent definitions
 * - Support modifier + action patterns
 * - Register lifecycle hooks
 *
 * Philosophy:
 * - Declarative over imperative
 * - Type-safe by default
 * - Clear validation errors
 */

import type { ActionContext, EndReason, Intent, IntentEvent } from '@/core/lib/intent/core/types'
import { validateIntent } from '@/core/lib/intent/vocabulary'

// ============================================================================
// Intent Builder
// ============================================================================

/**
 * Define an intent declaratively
 *
 * @param config - Intent configuration
 * @returns Type-safe intent definition
 */
export function defineIntent<
  TStart extends IntentEvent = IntentEvent,
  TUpdate extends IntentEvent = IntentEvent,
  TEnd extends IntentEvent = IntentEvent,
>(config: {
  id: string
  modifier?: Intent['modifier']
  action: Intent['action']
  spatial?: Intent['spatial']
  temporal?: Intent['temporal']
  onStart: (context: ActionContext) => TStart
  onUpdate: (context: ActionContext) => TUpdate
  onEnd: (context: ActionContext & { reason: EndReason }) => TEnd
}): Intent<TStart, TUpdate, TEnd> {
  // Validate configuration
  const validation = validateIntent({
    id: config.id,
    modifier: config.modifier,
    action: config.action,
    spatial: config.spatial,
    temporal: config.temporal,
  })

  if (!validation.success) {
    throw new Error(
      `Invalid intent definition: ${validation.error.issues
        .map((e) => e.message)
        .join(', ')}`
    )
  }

  // Return intent with lifecycle hooks
  return {
    id: config.id,
    modifier: config.modifier,
    action: config.action,
    spatial: config.spatial,
    temporal: config.temporal,
    onStart: config.onStart,
    onUpdate: config.onUpdate,
    onEnd: config.onEnd,
  }
}

// ============================================================================
// Intent Validation
// ============================================================================

/**
 * Validate an intent definition
 *
 * @param intent - Intent to validate
 * @returns Validation result
 */
export function validateIntentDefinition(
  intent: Intent
): { valid: boolean; errors: Array<string> } {
  const errors: Array<string> = []

  // Check required fields
  if (!intent.id || intent.id.trim() === '') {
    errors.push('Intent ID is required')
  }

  if (!intent.action) {
    errors.push('Action pattern is required')
  }

  if (!intent.onStart) {
    errors.push('onStart hook is required')
  }

  if (!intent.onUpdate) {
    errors.push('onUpdate hook is required')
  }

  if (!intent.onEnd) {
    errors.push('onEnd hook is required')
  }

  // Validate temporal constraints
  if (intent.temporal) {
    if (
      intent.temporal.minDuration !== undefined &&
      intent.temporal.minDuration < 0
    ) {
      errors.push('minDuration must be non-negative')
    }

    if (intent.temporal.maxGap !== undefined && intent.temporal.maxGap < 0) {
      errors.push('maxGap must be non-negative')
    }
  }

  // Validate spatial constraints
  if (intent.spatial?.grid) {
    if (intent.spatial.grid.cols <= 0) {
      errors.push('Grid cols must be positive')
    }

    if (intent.spatial.grid.rows <= 0) {
      errors.push('Grid rows must be positive')
    }
  }

  if (intent.spatial?.hysteresis) {
    if (
      intent.spatial.hysteresis.threshold < 0 ||
      intent.spatial.hysteresis.threshold > 1
    ) {
      errors.push('Hysteresis threshold must be between 0 and 1')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a simple event builder
 *
 * @param type - Event type
 * @returns Event builder function
 */
export function createEventBuilder(type: string) {
  return (context: ActionContext) => ({
    ...context,
    type,
    id: context.actionId,
  })
}

/**
 * Create a simple end event builder
 *
 * @param type - Event type
 * @returns End event builder function
 */
export function createEndEventBuilder(type: string) {
  return (context: ActionContext & { reason: EndReason }) => ({
    type,
    id: context.actionId,
    timestamp: context.timestamp,
    reason: context.reason,
    duration: context.duration,
  })
}


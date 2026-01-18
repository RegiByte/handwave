/**
 * Intent Engine - Create Engine (Factory)
 *
 * Factory function for creating intent engine instances.
 *
 * Responsibilities:
 * - Create and configure intent engine
 * - Set up frame processing pipeline
 * - Manage subscriptions
 * - Provide public API
 *
 * Philosophy:
 * - Simple factory pattern
 * - Clear API surface
 * - Proper lifecycle management
 */

import type {
  ActiveAction,
  FrameSnapshot,
  Intent,
  IntentEngine,
  IntentEngineConfig,
  IntentEvent,
  IntentEventCallback,
  UnsubscribeFn,
} from '@/core/lib/intent/core/types'

// ============================================================================
// Engine Factory
// ============================================================================

/**
 * Create an intent engine instance
 *
 * @param config - Engine configuration
 * @returns Intent engine API
 */
export function createIntentEngine(
  config: IntentEngineConfig
): IntentEngine {
  // TODO: Implement in Phase 3
  // 1. Initialize state (frame history, active actions)
  // 2. Set up frame processing subscription
  // 3. Create event emitter
  // 4. Return public API

  // Placeholder implementation
  const subscribers = new Map<string, Set<IntentEventCallback>>()
  const anySubscribers = new Set<IntentEventCallback>()
  let frameHistory: Array<FrameSnapshot> = []
  const activeActions = new Map<string, ActiveAction>()
  let running = false

  return {
    // Event subscription
    on: (eventType: string, callback: IntentEventCallback): UnsubscribeFn => {
      if (!subscribers.has(eventType)) {
        subscribers.set(eventType, new Set())
      }
      subscribers.get(eventType)!.add(callback)

      return () => {
        subscribers.get(eventType)?.delete(callback)
      }
    },

    onAny: (callback: IntentEventCallback): UnsubscribeFn => {
      anySubscribers.add(callback)

      return () => {
        anySubscribers.delete(callback)
      }
    },

    off: (eventType: string, callback: IntentEventCallback): void => {
      subscribers.get(eventType)?.delete(callback)
    },

    // State access
    getActiveActions: () => new Map(activeActions),
    getFrameHistory: () => [...frameHistory],
    getConfig: () => config,

    // Control
    start: () => {
      running = true
      // TODO: Start frame processing
    },

    stop: () => {
      running = false
      // TODO: Stop frame processing
    },

    pause: () => {
      // TODO: Pause frame processing
    },

    resume: () => {
      // TODO: Resume frame processing
    },

    // Lifecycle
    destroy: () => {
      running = false
      subscribers.clear()
      anySubscribers.clear()
      frameHistory = []
      activeActions.clear()
      // TODO: Clean up subscriptions
    },
  }
}

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Create default engine configuration
 *
 * @param overrides - Configuration overrides
 * @returns Complete engine configuration
 */
export function createDefaultConfig(
  overrides: Partial<IntentEngineConfig> = {}
): IntentEngineConfig {
  return {
    intents: [],
    historySize: 10,
    spatial: {
      grid: { cols: 8, rows: 6 },
      hysteresis: { threshold: 0.1 },
    },
    temporal: {
      defaultMinDuration: 100,
      defaultMaxGap: 200,
    },
    ...overrides,
  }
}

/**
 * Merge engine configurations
 *
 * @param base - Base configuration
 * @param overrides - Configuration overrides
 * @returns Merged configuration
 */
export function mergeConfigs(
  base: IntentEngineConfig,
  overrides: Partial<IntentEngineConfig>
): IntentEngineConfig {
  return {
    ...base,
    ...overrides,
    spatial: overrides.spatial
      ? {
          ...base.spatial,
          ...overrides.spatial,
        }
      : base.spatial,
    temporal: overrides.temporal
      ? {
          ...base.temporal,
          ...overrides.temporal,
        }
      : base.temporal,
    intents: overrides.intents ?? base.intents,
  }
}


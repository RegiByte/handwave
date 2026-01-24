/**
 * Intent Engine v2 - Braided Resource
 *
 * Resource wrapper for the v2 intent engine with the new DSL.
 * Drop-in replacement for the v1 resource.
 */

import { defineResource } from 'braided'
import type {
  ActiveAction,
  ConflictResolutionConfig,
  Intent,
  IntentEventDescriptor,
  Unsubscribe,
} from '@handwave/intent-engine'
import { processFrameV2 } from '@handwave/intent-engine'
import { createAtom, createEventBus } from '@handwave/system'
import type { EventCallback } from '@handwave/system';
import type { FrameHistoryResource } from '@/core/lib/intent/resources/frameHistoryResource'

export type IntentEngineAPI = {
  // Configuration
  configure: (intents: Array<Intent>, config?: Partial<ConflictResolutionConfig>) => void

  // Type-safe event subscription (NEW!)
  subscribe: <TEvent>(
    descriptor: IntentEventDescriptor<TEvent>,
    callback: EventCallback<TEvent>
  ) => Unsubscribe

 
  // State access
  getActiveActions: () => Map<string, ActiveAction>
  getConfig: () => ConflictResolutionConfig

  // Cleanup
  cleanup: () => void
}

// ============================================================================
// Resource Definition
// ============================================================================

/**
 * Intent Engine Resource
 *
 * Uses the new DSL and pattern matching system.
 * Compatible with the same particle system event handlers.
 */
export const intentEngineResource = defineResource({
  dependencies: ['frameHistory'],
  start: ({ frameHistory }: { frameHistory: FrameHistoryResource }) => {
    console.log('[Intent Engine v2] Starting...')

    // State
    const activeActions = createAtom<Map<string, ActiveAction>>(new Map())
    const eventBus = createEventBus({
      onError: (error, event) => {
        console.error('[Intent Engine] Event callback error:', error, 'Event:', event)
      },
    })

    // Configuration
    let intents: Array<Intent> = []
    let config: ConflictResolutionConfig = {
      intents: [],
      historySize: 30,
      spatial: {
        grid: { cols: 8, rows: 6 },
        hysteresis: { threshold: 0.1 },
      },
      temporal: {
        defaultMinDuration: 100,
        defaultMaxGap: 200,
      },
      // Conflict resolution - operates on intent instances (intent + hand combinations)
      maxConcurrentIntents: Infinity,
      groupLimits: {
        // Max 2 spawn actions TOTAL across all hands
        // Both simple spawn and modified spawns compete in this group
        // Modified spawns have priority 10, simple spawn has priority 0
        // If you do pinch+pointing, the modifier spawn wins. If just pointing, simple spawn activates.
        spawn: { max: 2, strategy: 'top-k' },
        // Max 2 vortex actions TOTAL across all hands
        // Each hand can create its own vortex simultaneously
        vortex: { max: 2, strategy: 'top-k' },
      },
    }

    // Frame processing state
    let lastProcessedTimestamp = 0
    let processing = false
    let frameCount = 0

    const processLatestFrame = () => {
      if (processing || intents.length === 0) return

      processing = true
      try {
        const history = frameHistory.getHistory()
        if (history.length === 0) {
          processing = false
          return
        }

        const latestFrame = history[history.length - 1]

        // Skip if we already processed this frame
        if (latestFrame.timestamp === lastProcessedTimestamp) {
          processing = false
          return
        }

        lastProcessedTimestamp = latestFrame.timestamp
        frameCount++

        // Debug log every 300 frames
        if (frameCount % 300 === 0) {
          console.log('[Intent Engine v2] Processed', frameCount, 'frames with', intents.length, 'intent(s)')
        }

        // Process frame through v2 intent pipeline
        const result = processFrameV2(
          latestFrame,
          history,
          intents,
          activeActions.get(),
          config
        )

        // Update state
        activeActions.set(result.actions)

        // Emit events through the event bus
        result.events.forEach((event) => {
          eventBus.emit(event.type, event)
        })
      } finally {
        processing = false
      }
    }

    // Poll for new frames (~60 FPS)
    const unsubscribeFrameHistory = frameHistory.subscribe((_frame) => {
      processLatestFrame()
    })

    console.log('[Intent Engine v2] ✅ Started')

    // Public API
    const api: IntentEngineAPI = {
      configure: (newIntents: Array<Intent>, newConfig?: Partial<ConflictResolutionConfig>) => {
        intents = newIntents
        if (newConfig) {
          config = { ...config, ...newConfig }
        }
        console.log('[Intent Engine v2] Configured with', intents.length, 'intents')
      },

      // Type-safe subscription using event descriptors
      subscribe: <TEvent>(
        descriptor: IntentEventDescriptor<TEvent>,
        callback: EventCallback<TEvent>
      ): Unsubscribe => {
        return eventBus.subscribe(descriptor, callback)
      },

      getActiveActions: () => new Map(activeActions.get()),

      getConfig: () => ({ ...config }),

      cleanup: () => {
        console.log('[Intent Engine v2] Stopping...')
        eventBus.clear()
        unsubscribeFrameHistory()
      },
    }

    return api
  },
  halt: (api) => {
    api.cleanup()
  },
})

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
import type { FrameHistoryResource } from '@/system/resources/frameHistoryResource'

export type IntentEngineAPI = {
  configure: (intents: Array<Intent>, config?: Partial<ConflictResolutionConfig>) => void

  subscribe: <TEvent>(
    descriptor: IntentEventDescriptor<TEvent>,
    callback: EventCallback<TEvent>
  ) => Unsubscribe

 
  getActiveActions: () => Map<string, ActiveAction>
  getConfig: () => ConflictResolutionConfig

  cleanup: () => void
}

export const intentEngineResource = defineResource({
  dependencies: ['frameHistory'],
  start: ({ frameHistory }: { frameHistory: FrameHistoryResource }) => {

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
        if (result.events.length > 0) {
          console.log('[IntentEngine] Events:', result.events.map(e => `${e.type} (hand ${e.handIndex})`))
        }
        result.events.forEach((event) => {
          eventBus.emit(event.type, event)
        })
      } finally {
        processing = false
      }
    }

    const unsubscribeFrameHistory = frameHistory.subscribe((_frame) => {
      processLatestFrame()
    })

    // Public API
    const api: IntentEngineAPI = {
      configure: (newIntents: Array<Intent>, newConfig?: Partial<ConflictResolutionConfig>) => {
        console.log('[IntentEngine] Configuring intents:', newIntents.map(i => i.id))
        intents = newIntents
        if (newConfig) {
          config = { ...config, ...newConfig }
        }
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

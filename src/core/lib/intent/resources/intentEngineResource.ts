/**
 * Intent Engine - Braided Resource
 *
 * Wraps the intent engine in a Braided resource for lifecycle management.
 *
 * Responsibilities:
 * - Define Braided resource
 * - Manage dependencies (frameHistory)
 * - Handle lifecycle (start/halt)
 * - Expose public API
 *
 * Philosophy:
 * - Consistent with existing resource patterns
 * - Clean dependency injection
 * - Proper cleanup
 * - Environment independent (subscribes to frame history, not loop)
 */

import { defineResource } from 'braided'
import { processFrame } from '@/core/lib/intent/core/intentEngine'
import type {
  ActiveAction,
  Intent,
  IntentEngineConfig,
  IntentEvent,
  IntentEventCallback,
  UnsubscribeFn,
} from '@/core/lib/intent/core/types'
import { createAtom, createSubscription } from '@/core/lib/state'
import { FrameHistoryResource } from './frameHistoryResource'

// ============================================================================
// Types
// ============================================================================


export type IntentEngineAPI = {
  // Configuration
  configure: (intents: Array<Intent>, config?: Partial<IntentEngineConfig>) => void

  // Event subscription
  on: (eventType: string, callback: IntentEventCallback) => UnsubscribeFn
  onAny: (callback: IntentEventCallback) => UnsubscribeFn

  // State access
  getActiveActions: () => Map<string, ActiveAction>
  getConfig: () => IntentEngineConfig

  // Cleanup
  cleanup: () => void
}

// ============================================================================
// Resource Definition
// ============================================================================

/**
 * Intent Engine Resource
 *
 * Usage:
 * ```typescript
 * const resources = {
 *   frameHistory: frameHistoryResource,
 *   intentEngine: intentEngineResource,
 * }
 *
 * const runtime = createRuntime(resources)
 * const intentEngine = runtime.resources.intentEngine
 * intentEngine.configure([myIntent])
 * ```
 */
export const intentEngineResource = defineResource({
  dependencies: ['frameHistory'],
  start: ({ frameHistory }: { frameHistory: FrameHistoryResource }) => {
    console.log('[Intent Engine] Starting...')

    // State
    const activeActions = createAtom<Map<string, ActiveAction>>(new Map())
    const intentEvents = createSubscription<IntentEvent>()

    // Configuration (will be set by consumer via configure())
    let intents: Array<Intent> = []
    let config: IntentEngineConfig = {
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
    }

    // Subscribe to frame history atom changes
    // This is environment-independent - we don't care where frames come from
    const unsubscribe = frameHistory.getHistory // Get the atom
    
    // Actually, we need to process on each new frame
    // Let's subscribe to the latest frame updates by polling the history
    let lastProcessedTimestamp = 0
    
    // We'll use a different approach - subscribe to frame history directly
    // by checking for new frames periodically or on updates
    // For now, let's create a simple subscription mechanism
    
    // Better approach: Process frames as they arrive
    // We'll need to hook into the frame stream somehow
    // For environment independence, let's process whenever history changes
    
    let processing = false
    
    // Debug: Track if we're processing
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
        
        // Debug log every 300 frames (~5 seconds at 60 FPS)
        if (frameCount % 300 === 0) {
          console.log('[Intent Engine] Processed', frameCount, 'frames with', intents.length, 'intent(s)')
        }

        // Process frame through intent pipeline
        const result = processFrame(
          latestFrame,
          history,
          intents,
          activeActions.get(),
          config
        )

        // Update state
        activeActions.set(result.updatedActions)

        // Emit events
        result.eventsToEmit.forEach((event) => {
          intentEvents.notify(event)
        })
      } finally {
        processing = false
      }
    }

    // Poll for new frames (simple approach for now)
    // In production, this would be event-driven
    const intervalId = setInterval(processLatestFrame, 16) // ~60 FPS

    console.log('[Intent Engine] ✅ Started')

    // Public API
    const api: IntentEngineAPI = {
      configure: (newIntents: Array<Intent>, newConfig?: Partial<IntentEngineConfig>) => {
        intents = newIntents
        if (newConfig) {
          config = { ...config, ...newConfig }
        }
        console.log('[Intent Engine] Configured with', intents.length, 'intents')
      },

      on: (eventType: string, callback: IntentEventCallback): UnsubscribeFn => {
        return intentEvents.subscribe((event) => {
          if (event.type === eventType) {
            callback(event)
          }
        })
      },

      onAny: (callback: IntentEventCallback): UnsubscribeFn => {
        return intentEvents.subscribe(callback)
      },

      getActiveActions: () => new Map(activeActions.get()),

      getConfig: () => ({ ...config }),

      cleanup: () => {
        console.log('[Intent Engine] Stopping...')
        clearInterval(intervalId)
      },
    }

    return api
  },
  halt: (api) => {
    api.cleanup()
  },
})


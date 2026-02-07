/**
 * Frame History Resource
 *
 * Maintains a ring buffer of recent detection frames for temporal queries.
 * Subscribes to loop frame events and enriches gesture results.
 *
 * Philosophy: Frame history enables temporal logic without state machines.
 */

import type { StartedResource } from 'braided';
import { defineResource } from 'braided'
import type { FrameSnapshot } from '@handwave/intent-engine'
import {
  addFrame,
  checkAnyInWindow,
  checkHeldFor,
  getAverageFPS,
  getContinuousDuration,
  getFrameAgo,
  getFramesInWindow,
  getHistoryDuration,
  getLatestFrame,
} from '@handwave/intent-engine'
import { createAtom, createSubscription } from '@handwave/system'
import type { Subscription } from '@handwave/system';
import type { DetectionWorkerResource, LoopResource } from '@handwave/mediapipe'

// ============================================================================
// Types
// ============================================================================


export type FrameHistoryAPI = {
  // State access
  getHistory: () => Array<FrameSnapshot>
  getLatestFrame: () => FrameSnapshot | null
  getFrameAgo: (n: number) => FrameSnapshot | null

  // Temporal queries
  getFramesInWindow: (durationMs: number) => Array<FrameSnapshot>
  checkHeldFor: (
    predicate: (frame: FrameSnapshot) => boolean,
    durationMs: number
  ) => boolean
  checkAnyInWindow: (
    predicate: (frame: FrameSnapshot) => boolean,
    durationMs: number
  ) => boolean
  getContinuousDuration: (
    predicate: (frame: FrameSnapshot) => boolean
  ) => number

  // Utility
  getHistoryDuration: () => number
  getAverageFPS: () => number

  subscribe: Subscription<FrameSnapshot>['subscribe']
}

export const frameHistoryResource = defineResource({
  dependencies: ['loop', 'detectionWorker'],
  start: ({ loop }: { loop: LoopResource; detectionWorker: DetectionWorkerResource }) => {
    const MAX_FRAMES = 300 // ~10 seconds at 30 FPS
    const history = createAtom<Array<FrameSnapshot>>([])
    const historySubscription = createSubscription<FrameSnapshot>()

    // Subscribe to loop frame events
    const unsubscribe = loop.frame$.subscribe((frameData) => {
      const snapshot: FrameSnapshot = {
        timestamp: frameData.timestamp,
        detectionFrame: frameData.enrichedDetectionFrame,
      }
      history.set(addFrame(history.get(), snapshot, MAX_FRAMES))

      historySubscription.notify(snapshot)
    })

    // Public API
    const api: FrameHistoryAPI = {
      // State access
      getHistory: () => history.get(),
      getLatestFrame: () => getLatestFrame(history.get()),
      getFrameAgo: (n: number) => getFrameAgo(history.get(), n),
      subscribe: historySubscription.subscribe,

      // Temporal queries
      getFramesInWindow: (durationMs: number) =>
        getFramesInWindow(history.get(), durationMs),
      checkHeldFor: (predicate, durationMs) =>
        checkHeldFor(history.get(), durationMs, predicate),
      checkAnyInWindow: (predicate, durationMs) =>
        checkAnyInWindow(history.get(), durationMs, predicate),
      getContinuousDuration: (predicate) =>
        getContinuousDuration(history.get(), predicate),

      // Utility
      getHistoryDuration: () => getHistoryDuration(history.get()),
      getAverageFPS: () => getAverageFPS(history.get()),

    }

    return {
      ...api,
      cleanup: () => {
        unsubscribe()
      },
    }
  },
  halt: (api) => {
    if (api.cleanup) {
      api.cleanup()
    }
  },
})

export type FrameHistoryResource = StartedResource<typeof frameHistoryResource>
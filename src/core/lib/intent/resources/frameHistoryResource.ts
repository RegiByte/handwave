/**
 * Frame History Resource
 *
 * Maintains a ring buffer of recent detection frames for temporal queries.
 * Subscribes to loop frame events and enriches gesture results.
 *
 * Philosophy: Frame history enables temporal logic without state machines.
 */

import { defineResource, StartedResource } from 'braided'
import type { GestureRecognizerResult } from '@mediapipe/tasks-vision'
import type { LoopResource } from '@/core/lib/mediapipe/resources/loop'
import { createAtom } from '@/core/lib/state'
import type { FrameSnapshot } from '@/core/lib/intent/core/types'
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
} from '@/core/lib/intent/core/frameHistory'
import type { DetectionWorkerResource } from '@/core/lib/mediapipe/resources/detectionWorker'

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
}

// ============================================================================
// Resource Definition
// ============================================================================

export const frameHistoryResource = defineResource({
  dependencies: ['loop', 'detectionWorker'],
  start: ({ loop }: { loop: LoopResource; detectionWorker: DetectionWorkerResource }) => {
    console.log('[FrameHistory] Starting...')

    const MAX_FRAMES = 300 // ~10 seconds at 30 FPS
    const history = createAtom<Array<FrameSnapshot>>([])

    /**
     * Enrich MediaPipe gesture result with handIndex and gesture info
     * Converts to format expected by FrameSnapshot
     */
    const enrichGestureResult = (
      result: GestureRecognizerResult | null
    ): FrameSnapshot['gestureResult'] => {
      if (!result) return null

      const hands: Array<{
        handedness: string
        handIndex: number
        headIndex: number
        gesture: string
        gestureScore: number
        landmarks: Array<{
          x: number
          y: number
          z: number
          visibility?: number
        }>
        worldLandmarks?: Array<{
          x: number
          y: number
          z: number
        }>
      }> = []

      // MediaPipe returns parallel arrays for landmarks, handedness, gestures
      const handCount = result.landmarks?.length || 0

      for (let i = 0; i < handCount; i++) {
        const landmarks = result.landmarks[i]
        const worldLandmarks = result.worldLandmarks?.[i]
        const handednessObj = result.handedness?.[i]
        const gestureObj = result.gestures?.[i]
        const handedness = handednessObj?.categories?.[0]
        const gesture = gestureObj?.categories?.[0]

        if (!landmarks) continue

        hands.push({
          handedness: handedness?.categoryName === 'Left' ? 'left' : 'right',
          handIndex: i,
          headIndex: (handednessObj as any)?.headIndex ?? 0, // Track which person (0-1 for 2 heads)
          gesture: gesture?.categoryName || 'None',
          gestureScore: gesture?.score || 0,
          landmarks: landmarks.map((lm) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility || 0,
          })),
          worldLandmarks: worldLandmarks
            ? worldLandmarks.map((wlm) => ({
              x: wlm.x,
              y: wlm.y,
              z: wlm.z,
            }))
            : undefined,
        })
      }

      return { hands }
    }

    // Subscribe to loop frame events
    const unsubscribe = loop.frame$.subscribe((frameData: any) => {
      const snapshot: FrameSnapshot = {
        timestamp: frameData.timestamp,
        faceResult: frameData.faceResult,
        gestureResult: enrichGestureResult(frameData.gestureResult),
      }
      const paused = loop.state.get().paused

      history.set(addFrame(history.get(), snapshot, MAX_FRAMES))


    })

    console.log('[FrameHistory] ✅ Started')

    // Public API
    const api: FrameHistoryAPI = {
      // State access
      getHistory: () => history.get(),
      getLatestFrame: () => getLatestFrame(history.get()),
      getFrameAgo: (n: number) => getFrameAgo(history.get(), n),

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
        console.log('[FrameHistory] Stopping...')
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
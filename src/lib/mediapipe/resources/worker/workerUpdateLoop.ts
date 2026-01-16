/**
 * Worker Update Loop Resource
 *
 * Independent update loop running in the worker thread.
 * Drives detection at its own optimal rate, decoupled from main thread.
 *
 * Philosophy: Worker owns its timeline. Main thread renders, worker detects.
 * Results flow back via message passing (later: SharedArrayBuffer).
 */

import type { StartedResource } from 'braided'
import { defineResource } from 'braided'
import type { DetectionResult } from '../../vocabulary/detectionSchemas'
import type { WorkerDetectorsResource } from './workerDetectors'
import type { WorkerStoreResource } from './workerStore'
import { createSubscription } from '@/lib/state'

// ============================================================================
// Types
// ============================================================================

export type LoopEvent =
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'frame'; result: DetectionResult }
  | { type: 'error'; error: string }

// ============================================================================
// Resource Definition
// ============================================================================

export const workerUpdateLoop = defineResource({
  dependencies: ['workerStore', 'workerDetectors'],
  start: ({
    workerStore,
    workerDetectors,
  }: {
    workerStore: WorkerStoreResource
    workerDetectors: WorkerDetectorsResource
  }) => {
    console.log('[WorkerUpdateLoop] Starting...')

    // Event subscription for loop state changes
    const eventSubscription = createSubscription<LoopEvent>()

    // Loop state
    let rafId: number | null = null
    let lastTickTime = 0
    let targetIntervalMs = 1000 / 30 // Default 30 FPS

    /**
     * Main update tick
     * Called on each animation frame when running
     */
    const tick = (timestamp: number) => {
      const state = workerStore.getState()

      // Check if we should continue
      if (!state.runtime.running) {
        rafId = null
        return
      }

      // Check if paused
      if (state.runtime.paused) {
        rafId = requestAnimationFrame(tick)
        return
      }

      // Throttle to target FPS
      const elapsed = timestamp - lastTickTime
      if (elapsed < targetIntervalMs) {
        rafId = requestAnimationFrame(tick)
        return
      }
      lastTickTime = timestamp

      // Run detection from latest frame
      if (workerDetectors.hasFrame()) {
        try {
          const result = workerDetectors.detectFromLatestFrame()
          if (result) {
            eventSubscription.notify({ type: 'frame', result })
          }
        } catch (error) {
          console.error('[WorkerUpdateLoop] Detection error:', error)
          eventSubscription.notify({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      // Schedule next tick
      rafId = requestAnimationFrame(tick)
    }

    /**
     * Start the update loop
     */
    const start = () => {
      const state = workerStore.getState()
      if (state.runtime.running) {
        console.log('[WorkerUpdateLoop] Already running')
        return
      }

      // Update target FPS from settings
      targetIntervalMs = 1000 / state.detection.targetFPS

      workerStore.setRunning(true)
      lastTickTime = performance.now()
      rafId = requestAnimationFrame(tick)

      console.log(
        '[WorkerUpdateLoop] Started at',
        state.detection.targetFPS,
        'FPS',
      )
      eventSubscription.notify({ type: 'started' })
    }

    /**
     * Stop the update loop
     */
    const stop = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      workerStore.setRunning(false)

      console.log('[WorkerUpdateLoop] Stopped')
      eventSubscription.notify({ type: 'stopped' })
    }

    /**
     * Pause the update loop (keeps RAF running but skips detection)
     */
    const pause = () => {
      workerStore.setPaused(true)
      console.log('[WorkerUpdateLoop] Paused')
      eventSubscription.notify({ type: 'paused' })
    }

    /**
     * Resume the update loop
     */
    const resume = () => {
      workerStore.setPaused(false)
      lastTickTime = performance.now()
      console.log('[WorkerUpdateLoop] Resumed')
      eventSubscription.notify({ type: 'resumed' })
    }

    /**
     * Set target FPS
     */
    const setTargetFPS = (fps: number) => {
      targetIntervalMs = 1000 / fps
      workerStore.setDetectionSettings({ targetFPS: fps })
      console.log('[WorkerUpdateLoop] Target FPS set to', fps)
    }

    return {
      // Loop control
      start,
      stop,
      pause,
      resume,
      isRunning: () => workerStore.getState().runtime.running,
      isPaused: () => workerStore.getState().runtime.paused,

      // Configuration
      setTargetFPS,

      // Events
      onEvent: eventSubscription.subscribe,

      // Cleanup
      cleanup: () => {
        stop()
        eventSubscription.clear()
      },
    }
  },
  halt: (api) => {
    console.log('[WorkerUpdateLoop] Halting...')
    api.cleanup()
  },
})

export type WorkerUpdateLoopResource = StartedResource<typeof workerUpdateLoop>

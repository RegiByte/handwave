/**
 * Worker Update Loop Resource
 *
 * Hybrid architecture: RAF loop for detection + event-driven frame pushing.
 * Main thread pushes frames to canvas, worker detects at max speed.
 *
 * Worker owns its timeline. Main thread renders, worker detects.
 * Results flow via SharedArrayBuffer (zero-copy).
 * RAF loop ensures low latency by detecting as fast as possible.
 *
 */

import type { StartedResource } from 'braided'
import { defineResource } from 'braided'
import { createSubscription } from '@handwave/system'
import type { WorkerDetectorsResource } from './workerDetectors'
import type { WorkerStoreResource } from './workerStore'
import type { FrameRaterAPI } from '../detection/frameRater'
import type { HandSpatialInfo } from '../vocabulary/detectionSchemas'

export type LoopEvent =
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'error'; error: string }
  | { type: 'spatialUpdate'; timestamp: number; hands: Array<HandSpatialInfo> }

export const workerUpdateLoop = defineResource({
  dependencies: ['workerStore', 'workerDetectors', 'frameRater'],
  start: ({
    workerStore,
    workerDetectors,
    frameRater,
  }: {
    workerStore: WorkerStoreResource
    workerDetectors: WorkerDetectorsResource
    frameRater: FrameRaterAPI
  }) => {
    console.log('[WorkerUpdateLoop] Starting...')

    // Event subscription for loop state changes
    const eventSubscription = createSubscription<LoopEvent>()

    // Create variable timestep executor for FPS tracking
    const detectionRater = frameRater.variable('workerDetection', {
      targetFPS: 60, // Target for display, but we'll run faster if we can
      smoothingWindow: 10,
      maxDeltaMs: 100, // Cap huge jumps
    })

    // RAF loop state
    let rafId: number | null = null
    let lastTickTime = 0

    /**
     * Main update tick - RAF loop for low-latency detection
     * Runs as fast as possible, detecting from canvas updated by pushFrame
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

      // Calculate delta time
      const deltaMs = timestamp - lastTickTime
      lastTickTime = timestamp

      // Run detection from canvas (updated by pushFrame)
      // No throttling - run as fast as we can for lowest latency!
      if (workerDetectors.hasFrame()) {
        try {
          // Get current FPS before detection
          const currentFPS = detectionRater.getFPS()

          // Run detection and pass FPS to be written to SharedArrayBuffer
          const spatialData = workerDetectors.detectFromLatestFrame(currentFPS)

          // Emit spatial update event if we have data
          if (spatialData) {
            eventSubscription.notify({
              type: 'spatialUpdate',
              timestamp,
              hands: spatialData,
            })
          }

          // Record frame for FPS tracking
          detectionRater.recordFrame(deltaMs)
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

    // Note: pushFrame updates the canvas directly, RAF loop detects from it
    // No callback needed - RAF loop handles detection independently

    /**
     * Start the update loop
     * Runs at maximum speed - no throttling!
     */
    const start = () => {
      const state = workerStore.getState()
      if (state.runtime.running) {
        console.log('[WorkerUpdateLoop] Already running')
        return
      }

      workerStore.setRunning(true)
      lastTickTime = performance.now()
      detectionRater.reset()
      rafId = requestAnimationFrame(tick)

      console.log('[WorkerUpdateLoop] Started (running at maximum speed)')
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
     * Get current detection FPS
     */
    const getDetectionFPS = () => detectionRater.getFPS()

    /**
     * Get detection metrics
     */
    const getMetrics = () => detectionRater.getMetrics()

    return {
      // Loop control
      start,
      stop,
      pause,
      resume,
      isRunning: () => workerStore.getState().runtime.running,
      isPaused: () => workerStore.getState().runtime.paused,

      // Metrics
      getDetectionFPS,
      getMetrics,

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

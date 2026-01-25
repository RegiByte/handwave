/**
 * Frame Rater Resource - Factory for Rate-Limited Executors
 *
 * Provides different execution strategies for different update loops.
 * Each strategy gets its own isolated state and configuration.
 *
 * Philosophy: "Everything is information processing"
 * - Single factory (frame rater)
 * - Domain separation (simulation, rendering, lifecycle)
 * - Different execution guarantees (fixed vs variable timestep)
 * - No central governor (each executor independent)
 *
 * Strategies:
 * - fixed: Fixed timestep with catch-up (deterministic physics)
 * - variable: Variable timestep with smoothing (rendering)
 * - throttled: Fixed interval checks (lifecycle, 1Hz)
 *
 * @example
 * const frameRater = useResource("frameRater");
 * const simulation = frameRater.fixed("simulation", { targetFPS: 60, maxCatchUp: 2 });
 * const renderer = frameRater.variable("renderer", { targetFPS: 60, smoothing: 10 });
 * const lifecycle = frameRater.throttled("lifecycle", { intervalMs: 1000 });
 */

import { defineResource } from 'braided'
import { createAtom } from '@handwave/system'

const ONE_SECOND_MS = 1000

export type ExecutionStrategy = 'fixed' | 'variable' | 'throttled'

export type FixedTimestepConfig = {
  targetFPS: number // e.g., 60
  maxUpdatesPerFrame: number // Max catch-up (prevents spiral)
  maxAccumulatedTime: number // Cap accumulator (prevents spiral)
}

export type VariableTimestepConfig = {
  targetFPS: number // Ideal FPS (for display)
  smoothingWindow: number // Frames to smooth over
  maxDeltaMs: number // Cap delta to prevent huge jumps
}

export type ThrottledConfig = {
  intervalMs: number // How often to execute (e.g., 1000 for 1Hz)
}

export type ExecutorMetrics = {
  fps: number // Current FPS
  avgFrameTime: number // Average frame time
  frameCount: number // Total frames
  droppedFrames: number // Dropped (fixed only)
  accumulatedTime: number // Time accumulated (for debugging)
}

type FixedTimestepState = {
  config: FixedTimestepConfig
  accumulator: number
  metrics: ExecutorMetrics
  smoothingWindow: Array<number>
}

export type FixedTimestepExecutor = {
  /** Get current configuration */
  getConfig: () => FixedTimestepConfig
  getTimestep: () => number

  /** Update config */
  setConfig: (config: Partial<FixedTimestepConfig>) => void

  /** Calculate how many updates should run this frame */
  shouldUpdate: (deltaMs: number) => {
    updates: number // How many fixed timestep updates to run
    timestep: number // The fixed timestep duration (in seconds)
    droppedFrames: number // Frames dropped to prevent spiral
  }

  /** Record that updates were executed */
  recordExecution: (updates: number, droppedFrames: number) => void

  /** Get current metrics */
  getMetrics: () => ExecutorMetrics

  /** Reset state */
  reset: () => void
}

function createFixedExecutor(
  name: string,
  config: FixedTimestepConfig,
): FixedTimestepExecutor {
  const stateAtom = createAtom<FixedTimestepState>({
    config,
    accumulator: 0,
    metrics: {
      fps: 0,
      avgFrameTime: 0,
      frameCount: 0,
      droppedFrames: 0,
      accumulatedTime: 0,
    },
    smoothingWindow: [],
  })

  return {
    getConfig: () => stateAtom.get().config,
    getTimestep: () => ONE_SECOND_MS / stateAtom.get().config.targetFPS,

    setConfig: (newConfig) => {
      stateAtom.update((state) => ({
        ...state,
        config: { ...state.config, ...newConfig },
      }))
    },

    shouldUpdate: (deltaMs: number) => {
      const state = stateAtom.get()
      const timestep = ONE_SECOND_MS / state.config.targetFPS
      let acc = state.accumulator + deltaMs
      let updates = 0
      let droppedFrames = 0

      if (acc > state.config.maxAccumulatedTime) {
        droppedFrames = Math.floor(
          (acc - state.config.maxAccumulatedTime) / timestep,
        )
        acc = state.config.maxAccumulatedTime
      }

      while (acc >= timestep && updates < state.config.maxUpdatesPerFrame) {
        updates++
        acc -= timestep
      }

      if (updates >= state.config.maxUpdatesPerFrame && acc >= timestep) {
        const extraUpdates = Math.floor(acc / timestep)
        droppedFrames += extraUpdates
        acc = acc % timestep
      }

      stateAtom.update((state) => ({ ...state, accumulator: acc }))

      if (droppedFrames > 0) {
        console.warn(
          `[frameRater:${name}] Dropped ${droppedFrames} frame(s) to prevent spiral`,
        )
      }

      return { updates, timestep: timestep / 1000, droppedFrames } // Return timestep in seconds
    },

    recordExecution: (updates: number, droppedFrames: number) => {
      stateAtom.update((state) => {
        const newFrameCount = state.metrics.frameCount + updates
        const newDroppedFrames = state.metrics.droppedFrames + droppedFrames
        const frameTime = ONE_SECOND_MS / state.config.targetFPS

        const newWindow = [...state.smoothingWindow, frameTime]
        if (newWindow.length > 10) newWindow.shift()

        const avgFrameTime =
          newWindow.reduce((sum, t) => sum + t, 0) / newWindow.length
        const fps = avgFrameTime > 0 ? ONE_SECOND_MS / avgFrameTime : 0

        return {
          ...state,
          metrics: {
            fps,
            avgFrameTime,
            frameCount: newFrameCount,
            droppedFrames: newDroppedFrames,
            accumulatedTime: state.accumulator,
          },
          smoothingWindow: newWindow,
        }
      })
    },

    getMetrics: () => stateAtom.get().metrics,

    reset: () => {
      stateAtom.update((state) => ({
        ...state,
        accumulator: 0,
        metrics: {
          fps: 0,
          avgFrameTime: 0,
          frameCount: 0,
          droppedFrames: 0,
          accumulatedTime: 0,
        },
        smoothingWindow: [],
      }))
    },
  }
}

type VariableTimestepState = {
  config: VariableTimestepConfig
  metrics: ExecutorMetrics
  smoothingWindow: Array<number>
}

export type VariableTimestepExecutor = {
  /** Get current configuration */
  getConfig: () => VariableTimestepConfig

  /** Update config */
  setConfig: (config: Partial<VariableTimestepConfig>) => void

  /** Calculate delta time for this frame (capped and smoothed) */
  getDelta: (deltaMs: number) => {
    deltaSeconds: number // Time to use for update (in seconds)
    cappedMs: number // Actual capped delta in ms
  }

  /** Record frame execution */
  recordFrame: (deltaMs: number) => void

  /** Get current metrics (smoothed FPS) */
  getMetrics: () => ExecutorMetrics

  /** Get smoothed FPS */
  getFPS: () => number

  /** Reset state */
  reset: () => void
}

function createVariableExecutor(
  name: string,
  config: VariableTimestepConfig,
): VariableTimestepExecutor {
  const stateAtom = createAtom<VariableTimestepState>({
    config,
    metrics: {
      fps: 0,
      avgFrameTime: 0,
      frameCount: 0,
      droppedFrames: 0,
      accumulatedTime: 0,
    },
    smoothingWindow: [],
  })

  console.log(
    `[frameRater:${name}] Variable timestep executor: target ${config.targetFPS} FPS, ` +
      `smoothing window: ${config.smoothingWindow} frames, max delta: ${config.maxDeltaMs}ms`,
  )

  return {
    getConfig: () => stateAtom.get().config,

    setConfig: (newConfig) => {
      stateAtom.update((state) => ({
        ...state,
        config: { ...state.config, ...newConfig },
      }))
    },

    getDelta: (deltaMs: number) => {
      const state = stateAtom.get()
      const cappedMs = Math.min(deltaMs, state.config.maxDeltaMs)
      const deltaSeconds = cappedMs / ONE_SECOND_MS

      return { deltaSeconds, cappedMs }
    },

    recordFrame: (deltaMs: number) => {
      stateAtom.update((state) => {
        const cappedMs = Math.min(deltaMs, state.config.maxDeltaMs)

        const newWindow = [...state.smoothingWindow, cappedMs]
        if (newWindow.length > state.config.smoothingWindow) {
          newWindow.shift()
        }

        const avgFrameTime =
          newWindow.reduce((sum, t) => sum + t, 0) / newWindow.length
        const fps = avgFrameTime > 0 ? ONE_SECOND_MS / avgFrameTime : 0

        return {
          ...state,
          metrics: {
            fps,
            avgFrameTime,
            frameCount: state.metrics.frameCount + 1,
            droppedFrames: 0, // Variable timestep doesn't drop frames
            accumulatedTime: 0,
          },
          smoothingWindow: newWindow,
        }
      })
    },

    getMetrics: () => stateAtom.get().metrics,

    getFPS: () => stateAtom.get().metrics.fps,

    reset: () => {
      stateAtom.update((state) => ({
        ...state,
        metrics: {
          fps: 0,
          avgFrameTime: 0,
          frameCount: 0,
          droppedFrames: 0,
          accumulatedTime: 0,
        },
        smoothingWindow: [],
      }))
    },
  }
}

type ThrottledState = {
  config: ThrottledConfig
  metrics: ExecutorMetrics
  accumulator: number // Time accumulated since last execution
}

export type ThrottledExecutor = {
  /** Get current configuration */
  getConfig: () => ThrottledConfig

  /** Update config */
  setConfig: (config: Partial<ThrottledConfig>) => void

  /**
   * Check if enough time has passed to execute
   * Uses simulation time (deltaMs) rather than real-world time
   */
  shouldExecute: (deltaMs: number) => boolean

  /** Record execution */
  recordExecution: () => void

  /** Get current metrics */
  getMetrics: () => ExecutorMetrics

  /** Reset state */
  reset: () => void
}

function createThrottledExecutor(
  name: string,
  config: ThrottledConfig,
): ThrottledExecutor {
  const stateAtom = createAtom<ThrottledState>({
    config,
    metrics: {
      fps: ONE_SECOND_MS / config.intervalMs,
      avgFrameTime: config.intervalMs,
      frameCount: 0,
      droppedFrames: 0,
      accumulatedTime: 0,
    },
    accumulator: 0,
  })

  console.log(
    `[frameRater:${name}] Throttled executor: ${config.intervalMs}ms interval ` +
      `(${(ONE_SECOND_MS / config.intervalMs).toFixed(2)} Hz)`,
  )

  return {
    getConfig: () => stateAtom.get().config,

    setConfig: (newConfig) => {
      stateAtom.update((state) => ({
        ...state,
        config: { ...state.config, ...newConfig },
      }))
    },

    shouldExecute: (deltaMs: number) => {
      let shouldExecute = false

      stateAtom.update((state) => {
        const newAccumulator = state.accumulator + deltaMs

        if (newAccumulator >= state.config.intervalMs) {
          shouldExecute = true
          return {
            ...state,
            accumulator: newAccumulator - state.config.intervalMs,
          }
        }

        return {
          ...state,
          accumulator: newAccumulator,
        }
      })

      return shouldExecute
    },

    recordExecution: () => {
      stateAtom.update((state) => ({
        ...state,
        metrics: {
          fps: ONE_SECOND_MS / state.config.intervalMs,
          avgFrameTime: state.config.intervalMs,
          frameCount: state.metrics.frameCount + 1,
          droppedFrames: 0,
          accumulatedTime: state.accumulator,
        },
      }))
    },

    getMetrics: () => stateAtom.get().metrics,

    reset: () => {
      stateAtom.update((state) => ({
        ...state,
        metrics: {
          fps: ONE_SECOND_MS / state.config.intervalMs,
          avgFrameTime: state.config.intervalMs,
          frameCount: 0,
          droppedFrames: 0,
          accumulatedTime: 0,
        },
        accumulator: 0,
      }))
    },
  }
}

export type FrameRaterAPI = {
  /** Create a fixed timestep executor (for deterministic physics) */
  fixed: (name: string, config: FixedTimestepConfig) => FixedTimestepExecutor

  /** Create a variable timestep executor (for rendering) */
  variable: (
    name: string,
    config: VariableTimestepConfig,
  ) => VariableTimestepExecutor

  /** Create a throttled executor (for periodic tasks) */
  throttled: (name: string, config: ThrottledConfig) => ThrottledExecutor

  /** Get all active executor names */
  getExecutors: () => Array<string>

  /** Remove an executor */
  remove: (name: string) => void

  /** Cleanup all executors */
  cleanup: () => void
}

export const frameRater = defineResource({
  dependencies: [],
  start: () => {
    const executors = new Map<
      string,
      {
        type: ExecutionStrategy
        instance:
          | FixedTimestepExecutor
          | VariableTimestepExecutor
          | ThrottledExecutor
      }
    >()

    console.log('[frameRater] Factory initialized')

    const api = {
      fixed: (name: string, config: FixedTimestepConfig) => {
        if (executors.has(name)) {
          console.warn(
            `[frameRater] Executor "${name}" already exists, returning existing`,
          )
          return executors.get(name)!.instance as FixedTimestepExecutor
        }

        const executor = createFixedExecutor(name, config)
        executors.set(name, { type: 'fixed', instance: executor })
        return executor
      },

      variable: (name: string, config: VariableTimestepConfig) => {
        if (executors.has(name)) {
          console.warn(
            `[frameRater] Executor "${name}" already exists, returning existing`,
          )
          return executors.get(name)!.instance as VariableTimestepExecutor
        }

        const executor = createVariableExecutor(name, config)
        executors.set(name, { type: 'variable', instance: executor })
        return executor
      },

      throttled: (name: string, config: ThrottledConfig) => {
        if (executors.has(name)) {
          console.warn(
            `[frameRater] Executor "${name}" already exists, returning existing`,
          )
          return executors.get(name)!.instance as ThrottledExecutor
        }

        const executor = createThrottledExecutor(name, config)
        executors.set(name, { type: 'throttled', instance: executor })
        return executor
      },

      getExecutors: () => Array.from(executors.keys()),

      remove: (name: string) => {
        if (executors.has(name)) {
          executors.delete(name)
        }
      },
      cleanup: () => {
        executors.clear()
        console.log('[frameRater] Factory cleaned up')
      },
    } satisfies FrameRaterAPI

    return api
  },
  halt: (api) => {
    console.log('[frameRater] Factory halted')
    api.cleanup()
  },
})

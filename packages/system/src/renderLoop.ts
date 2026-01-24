/**
 * Generic Render Loop
 *
 * A reusable abstraction for any frame-based system (2D canvas, 3D R3F, audio, etc.)
 * Provides requestAnimationFrame orchestration with pause/resume and error handling.
 *
 * Philosophy:
 * - Generic context type for maximum flexibility
 * - Lifecycle hooks (beforeRender, afterRender) for custom logic
 * - FPS throttling support (optional)
 * - Clean state management (running, paused)
 * - Error handling with recovery
 */

export type RenderLoopOptions<TContext> = {
  /**
   * Factory function to create the render context
   * Called once when the loop starts
   */
  createContext: () => TContext

  /**
   * Optional hook called before each frame
   * Use for state updates, data fetching, etc.
   */
  beforeRender?: (context: TContext, timestamp: number, deltaMs: number) => void

  /**
   * Optional hook called after each frame
   * Use for rendering, task execution, etc.
   */
  afterRender?: (context: TContext, timestamp: number, deltaMs: number) => void

  /**
   * Optional error handler
   * Called when beforeRender or afterRender throws
   */
  onError?: (error: Error) => void

  /**
   * Optional target FPS for throttling
   * If not specified, runs at native RAF rate (~60 FPS)
   */
  targetFPS?: number
}

export type RenderLoopAPI<TContext = unknown> = {
  /**
   * Start the render loop
   * Safe to call multiple times (idempotent)
   */
  start: () => void

  /**
   * Stop the render loop
   * Cancels RAF and resets state
   */
  stop: () => void

  /**
   * Pause the render loop
   * Stops RAF but maintains state
   */
  pause: () => void

  /**
   * Resume the render loop
   * Restarts RAF from paused state
   */
  resume: () => void

  /**
   * Check if loop is running
   */
  isRunning: () => boolean

  /**
   * Check if loop is paused
   */
  isPaused: () => boolean

  /**
   * Get the current context
   * Returns null if loop hasn't started yet
   */
  getContext: () => TContext | null
}

/**
 * Create a generic render loop
 *
 * @example
 * ```typescript
 * const loop = createRenderLoop({
 *   createContext: () => ({
 *     ctx: canvas.getContext('2d'),
 *     tasks: [...],
 *   }),
 *   beforeRender: (context, timestamp, deltaMs) => {
 *     // Update state
 *   },
 *   afterRender: (context, timestamp, deltaMs) => {
 *     // Execute render tasks
 *     context.tasks.forEach(task => task(context))
 *   },
 * })
 *
 * loop.start()
 * ```
 */
export function createRenderLoop<TContext>(
  options: RenderLoopOptions<TContext>,
): RenderLoopAPI<TContext> {
  const {
    createContext,
    beforeRender,
    afterRender,
    onError,
    targetFPS,
  } = options

  // State
  let running = false
  let paused = false
  let rafId: number | null = null
  let context: TContext | null = null
  let lastTimestamp = 0

  // FPS throttling
  const frameInterval = targetFPS ? 1000 / targetFPS : 0

  /**
   * Main render loop tick
   */
  const tick = (timestamp: number) => {
    if (!running) return

    // Calculate delta
    const deltaMs = lastTimestamp === 0 ? 0 : timestamp - lastTimestamp

    // FPS throttling (skip if not first frame and delta is too small)
    if (frameInterval > 0 && lastTimestamp !== 0 && deltaMs < frameInterval) {
      rafId = requestAnimationFrame(tick)
      return
    }

    lastTimestamp = timestamp

    try {
      // Execute lifecycle hooks
      if (context) {
        beforeRender?.(context, timestamp, deltaMs)
        afterRender?.(context, timestamp, deltaMs)
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)))
      } else {
        console.error('[RenderLoop] Error in render loop:', error)
      }
    }

    // Schedule next frame
    rafId = requestAnimationFrame(tick)
  }

  /**
   * Start the loop
   */
  const start = () => {
    if (running) return

    // Create context if not exists
    if (!context) {
      context = createContext()
    }

    running = true
    paused = false
    lastTimestamp = 0

    rafId = requestAnimationFrame(tick)
  }

  /**
   * Stop the loop
   */
  const stop = () => {
    running = false
    paused = false

    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    lastTimestamp = 0
  }

  /**
   * Pause the loop
   */
  const pause = () => {
    if (!running || paused) return

    paused = true

    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  /**
   * Resume the loop
   */
  const resume = () => {
    if (!running || !paused) return

    paused = false
    lastTimestamp = 0

    rafId = requestAnimationFrame(tick)
  }

  /**
   * Check if running
   */
  const isRunning = () => running

  /**
   * Check if paused
   */
  const isPaused = () => paused

  /**
   * Get context
   */
  const getContext = () => context

  return {
    start,
    stop,
    pause,
    resume,
    isRunning,
    isPaused,
    getContext,
  }
}

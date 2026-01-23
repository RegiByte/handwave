/**
 * Task Pipeline
 *
 * Generic task execution pipeline with lifecycle management.
 * Tasks can be simple functions or objects with init/execute/cleanup lifecycle.
 *
 * Philosophy:
 * - Simple rules compose
 * - No central governor
 * - Tasks are isolated and composable
 * - Context is just data flowing through
 */

/**
 * Task with full lifecycle support
 */
type TaskWithLifecycle<TContext, TContextInit> = {
    init?: (contextInit: TContextInit) => void | Promise<void>
    execute: (context: TContext) => void
    cleanup?: () => void
}

/**
 * Simple task function (no lifecycle)
 */
type TaskFn<TContext> = (context: TContext) => void

/**
 * Task can be either a simple function or an object with lifecycle
 */
type TaskDefinition<TContext, TContextInit> =
    | TaskWithLifecycle<TContext, TContextInit>
    | TaskFn<TContext>

/**
 * Task pipeline API
 */
type TaskPipeline<TContext, TContextInit> = {
    /**
     * Add a task to the pipeline.
     * Returns unsubscribe function to remove the task.
     * If task has async init, it will be tracked and awaited before execution.
     */
    addTask: (task: TaskDefinition<TContext, TContextInit>) => Promise<() => void>

    /**
     * Execute all tasks with the given context.
     * Only executes tasks that have completed initialization.
     */
    execute: (context: TContext) => void

    /**
     * Clear all tasks, calling cleanup on each.
     */
    clear: () => void
}

/**
 * Options for creating a task pipeline
 */
type TaskPipelineOptions<TContext, TContextInit> = {
    /**
     * Function that returns initialization context for each new task.
     * Re-evaluated for each task added.
     */
    contextInit: () => TContextInit

    /**
     * Optional error handler for task execution errors.
     * If not provided, errors will be thrown.
     */
    onError?: (error: Error, task: TaskDefinition<TContext, TContextInit>) => void
}

/**
 * Create a task pipeline
 */
export const createTaskPipeline = <TContext, TContextInit = undefined>(
    options: TaskPipelineOptions<TContext, TContextInit>,
): TaskPipeline<TContext, TContextInit> => {
    const tasks: Array<TaskDefinition<TContext, TContextInit>> = []
    const { contextInit, onError } = options

    // Track tasks that are currently initializing
    // Maps task instance to its initialization promise
    const initializingTasks = new WeakMap<
        TaskWithLifecycle<TContext, TContextInit>,
        Promise<void>
    >()

    const api = {
        addTask: async (task) => {
            // Simple function task - add immediately
            if (typeof task === 'function') {
                tasks.push(task)
                return () => {
                    const index = tasks.indexOf(task)
                    if (index > -1) tasks.splice(index, 1)
                }
            }

            // Lifecycle task - handle initialization
            // Check if this task is already initializing
            const existingInit = initializingTasks.get(task)
            if (existingInit) {
                // Wait for existing initialization to complete
                await existingInit
                // Return unsubscribe function (task is already in array)
                return () => {
                    task.cleanup?.()
                    const index = tasks.indexOf(task)
                    if (index > -1) tasks.splice(index, 1)
                }
            }

            // Check if task has init
            if (task.init) {
                // Get fresh init context
                const initContext = contextInit()

                // Call init and track the promise
                const initResult = task.init(initContext)

                // If init returns a promise, track it
                if (initResult instanceof Promise) {
                    initializingTasks.set(task, initResult)

                    try {
                        await initResult
                    } finally {
                        // Remove from initializing map once done
                        initializingTasks.delete(task)
                    }
                }
            }

            // Add task to array after initialization completes
            tasks.push(task)

            // Return unsubscribe function
            return () => {
                task.cleanup?.()
                const index = tasks.indexOf(task)
                if (index > -1) tasks.splice(index, 1)
            }
        },

        execute: (context) => {
            for (const task of tasks) {
                try {
                    if (typeof task === 'function') {
                        task(context)
                    } else {
                        task.execute(context)
                    }
                } catch (error) {
                    if (onError) {
                        onError(error as Error, task)
                    } else {
                        throw error
                    }
                }
            }
        },

        clear: () => {
            // Call cleanup on all lifecycle tasks
            for (const task of tasks) {
                if (typeof task !== 'function') {
                    try {
                        task.cleanup?.()
                    } catch (error) {
                        if (onError) {
                            onError(error as Error, task)
                        } else {
                            console.error('Task cleanup error:', error)
                        }
                    }
                }
            }

            // Clear the array
            tasks.length = 0
        },
    } satisfies TaskPipeline<TContext, TContextInit>

    return api
}

/**
 * Helper to create tasks with closure-based state.
 * Enables self-contained task definitions with encapsulated state.
 * 
 * @example
 * ```ts
 * const particleTask = task(() => {
 *   const particles: Particle[] = []
 *   
 *   return {
 *     init: (ctx) => {
 *       ctx.intentEngine.on('spawn', () => particles.push(createParticle()))
 *     },
 *     execute: (ctx) => {
 *       particles.forEach(p => renderParticle(ctx.canvas, p))
 *     },
 *     cleanup: () => {
 *       particles.length = 0
 *     }
 *   }
 * })
 * ```
 */
export const task = <TContext, TContextInit = undefined>(
    createFn: () => TaskDefinition<TContext, TContextInit>
): TaskDefinition<TContext, TContextInit> => {
    return createFn()
}
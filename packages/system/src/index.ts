/**
 * @handwave/system
 *
 * Generic system utilities for building HandWave applications.
 * Framework-agnostic infrastructure that works with any bundler.
 *
 * Philosophy:
 * - Pure utilities, no framework dependencies (except Braided for resources)
 * - Reusable across different vision backends (MediaPipe, TensorFlow, etc.)
 * - Type-safe by default
 * - Minimal boilerplate
 *
 * ## Modules
 *
 * ### Worker Tasks
 * Type-safe bidirectional worker communication with ~90% less boilerplate.
 * Define tasks as data, get automatic type inference and event handling.
 *
 * ### State Management
 * Lightweight atoms and subscriptions for reactive state.
 * Works with React (useSyncExternalStore) or vanilla JS.
 *
 * ### Task Pipeline
 * Generic task execution pipeline with lifecycle management.
 * Composable tasks with init/execute/cleanup lifecycle and error handling.
 *
 * @example
 * ```ts
 * import { createWorkerClient, defineTask, createAtom, createTaskPipeline } from '@handwave/system'
 *
 * // Define worker tasks
 * const tasks = {
 *   detect: defineTask({
 *     input: z.object({ frame: z.instanceof(ImageData) }),
 *     output: z.object({ hands: z.array(z.any()) }),
 *     execute: async (input) => detectHands(input.frame),
 *   }),
 * }
 *
 * // Create client
 * const worker = createWorkerClient({ tasks, importWorker: () => import('./worker?worker') })
 *
 * // Manage state
 * const detections = createAtom([])
 * worker.dispatch('detect', { frame }).onComplete((result) => {
 *   detections.set(result.hands)
 * })
 *
 * // Create task pipeline
 * const pipeline = createTaskPipeline({
 *   contextInit: () => ({ canvas, video }),
 *   onError: (error) => console.error('Task error:', error),
 * })
 * await pipeline.addTask((ctx) => { })
 * pipeline.execute({ canvas, video, timestamp: Date.now() })
 * ```
 */

// ============================================================================
// Worker Tasks Abstraction
// ============================================================================

export * from './workerTasks'

// ============================================================================
// State Management
// ============================================================================

export * from './state'

// ============================================================================
// Task Pipeline
// ============================================================================

export * from './taskPipeline'

// ============================================================================
// Event Bus
// ============================================================================

export * from './eventBus'

// ============================================================================
// Render Loop
// ============================================================================

export * from './renderLoop'
export * from './renderLoopResource'

/**
 * Worker Tasks Abstraction
 *
 * Type-safe bidirectional worker communication with minimal boilerplate.
 *
 * @example
 * ```ts
 * // Define tasks
 * const tasks = {
 *   processImage: defineTask({
 *     input: z.object({ imageData: z.instanceof(ImageData) }),
 *     output: z.object({ result: z.string() }),
 *     execute: async (input) => ({ result: 'processed' }),
 *   }),
 * }
 *
 * // Create client resource
 * const workerClient = createWorkerClient({
 *   tasks,
 *   importWorker: () => import('./worker?worker'),
 * })
 *
 * // Dispatch tasks
 * workerClient.dispatch('processImage', { imageData })
 *   .onComplete((result) => console.log(result))
 * ```
 */

export * from './core'
export * from './client'
export * from './worker'

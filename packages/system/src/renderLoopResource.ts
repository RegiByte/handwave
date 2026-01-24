/**
 * Render Loop Resource
 *
 * Higher-order resource pattern for render loops.
 * Wraps createRenderLoop with Braided resource lifecycle.
 *
 * Philosophy:
 * - Automatic cleanup on resource halt
 * - Composable with other resources
 * - Type-safe context management
 */

import { defineResource } from 'braided'
import { createRenderLoop } from './renderLoop'
import type { RenderLoopOptions } from './renderLoop';

/**
 * Create a Braided resource for a render loop
 *
 * @example
 * ```typescript
 * const renderLoopResource = createRenderLoopResource({
 *   createContext: () => ({
 *     ctx: canvas.getContext('2d'),
 *     tasks: [...],
 *   }),
 *   afterRender: (context) => {
 *     context.tasks.forEach(task => task(context))
 *   },
 * })
 *
 * // In Braided app
 * const loop = useResource(renderLoopResource)
 * ```
 */
export function createRenderLoopResource<TContext>(
  options: RenderLoopOptions<TContext>,
) {
  return defineResource({
    start: ({ onCleanup }) => {
      const loop = createRenderLoop(options)

      // Start loop automatically
      loop.start()

      // Register cleanup
      onCleanup(() => {
        loop.stop()
      })

      return loop
    },
    halt: (loop) => {
      loop.stop()
    },
  })
}

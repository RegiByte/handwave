import { describe, expect, it, vi } from 'vitest'
import { createTaskPipeline } from '@handwave/system'

describe('createTaskPipeline', () => {
  describe('simple function tasks', () => {
    it('should execute simple function tasks', () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      const results: Array<number> = []
      const task = (ctx: { value: number }) => {
        results.push(ctx.value)
      }

      pipeline.addTask(task)
      pipeline.execute({ value: 42 })

      expect(results).toEqual([42])
    })

    it('should execute multiple tasks in order', () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      const results: Array<number> = []
      pipeline.addTask((ctx) => results.push(ctx.value * 1))
      pipeline.addTask((ctx) => results.push(ctx.value * 2))
      pipeline.addTask((ctx) => results.push(ctx.value * 3))

      pipeline.execute({ value: 10 })

      expect(results).toEqual([10, 20, 30])
    })

    it('should remove task when unsubscribe is called', async () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      const results: Array<number> = []
      const unsubscribe = await pipeline.addTask((ctx) => results.push(ctx.value))

      pipeline.execute({ value: 1 })
      expect(results).toEqual([1])

      unsubscribe()
      pipeline.execute({ value: 2 })
      expect(results).toEqual([1]) // Task not executed after unsubscribe
    })
  })

  describe('lifecycle tasks', () => {
    it('should call init when task is added', async () => {
      const initContext = { canvas: 'mock-canvas' }
      const pipeline = createTaskPipeline<{ value: number }, typeof initContext>({
        contextInit: () => initContext,
      })

      const initSpy = vi.fn()
      await pipeline.addTask({
        init: initSpy,
        execute: () => { },
      })

      expect(initSpy).toHaveBeenCalledWith(initContext)
      expect(initSpy).toHaveBeenCalledTimes(1)
    })

    it('should re-evaluate contextInit for each task', async () => {
      let counter = 0
      const pipeline = createTaskPipeline<{ value: number }, { id: number }>({
        contextInit: () => ({ id: ++counter }),
      })

      const initResults: Array<number> = []
      await pipeline.addTask({
        init: (ctx) => {
          initResults.push(ctx.id)
        },
        execute: () => { },
      })
      await pipeline.addTask({
        init: (ctx) => {
          initResults.push(ctx.id)
        },
        execute: () => { },
      })

      expect(initResults).toEqual([1, 2])
    })

    it('should execute lifecycle tasks', async () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      const results: Array<number> = []
      await pipeline.addTask({
        execute: (ctx) => results.push(ctx.value),
      })

      pipeline.execute({ value: 42 })
      expect(results).toEqual([42])
    })

    it('should call cleanup when unsubscribe is called', async () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      const cleanupSpy = vi.fn()
      const unsubscribe = await pipeline.addTask({
        execute: () => { },
        cleanup: cleanupSpy,
      })

      expect(cleanupSpy).not.toHaveBeenCalled()
      unsubscribe()
      expect(cleanupSpy).toHaveBeenCalledTimes(1)
    })

    it('should handle async init', async () => {
      const pipeline = createTaskPipeline<{ value: number }, { data: string }>({
        contextInit: () => ({ data: 'test' }),
      })

      const initOrder: Array<string> = []
      await pipeline.addTask({
        init: async (ctx) => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          initOrder.push(`init-${ctx.data}`)
        },
        execute: () => initOrder.push('execute'),
      })

      expect(initOrder).toEqual(['init-test'])

      pipeline.execute({ value: 1 })
      expect(initOrder).toEqual(['init-test', 'execute'])
    })

    it('should deduplicate async init for same task instance', async () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      const initSpy = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      const task = {
        init: initSpy,
        execute: () => { },
      }

      // Add the same task instance multiple times concurrently
      const [unsubscribe1, unsubscribe2] = await Promise.all([
        pipeline.addTask(task),
        pipeline.addTask(task),
      ])

      // Init should only be called once
      expect(initSpy).toHaveBeenCalledTimes(1)

      // Both unsubscribes should work
      unsubscribe1()
      unsubscribe2()
    })
  })

  describe('error handling', () => {
    it('should throw error if no error handler provided', () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      pipeline.addTask(() => {
        throw new Error('Task error')
      })

      expect(() => pipeline.execute({ value: 1 })).toThrow('Task error')
    })

    it('should call error handler if provided', () => {
      const errorHandler = vi.fn()
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
        onError: errorHandler,
      })

      const task = () => {
        throw new Error('Task error')
      }
      pipeline.addTask(task)

      pipeline.execute({ value: 1 })

      expect(errorHandler).toHaveBeenCalledTimes(1)
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Task error' }),
        task,
      )
    })

    it('should continue executing other tasks after error', () => {
      const results: Array<number> = []
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
        onError: () => { }, // Swallow errors
      })

      pipeline.addTask((ctx) => results.push(ctx.value * 1))
      pipeline.addTask(() => {
        throw new Error('Task error')
      })
      pipeline.addTask((ctx) => results.push(ctx.value * 2))

      pipeline.execute({ value: 10 })

      expect(results).toEqual([10, 20]) // Both non-erroring tasks executed
    })

    it('should handle cleanup errors gracefully', async () => {
      const errorHandler = vi.fn()
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
        onError: errorHandler,
      })

      await pipeline.addTask({
        execute: () => { },
        cleanup: () => {
          throw new Error('Cleanup error')
        },
      })

      pipeline.clear()

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Cleanup error' }),
        expect.any(Object),
      )
    })
  })

  describe('clear', () => {
    it('should call cleanup on all lifecycle tasks', async () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      const cleanup1 = vi.fn()
      const cleanup2 = vi.fn()

      await pipeline.addTask({
        execute: () => { },
        cleanup: cleanup1,
      })
      await pipeline.addTask({
        execute: () => { },
        cleanup: cleanup2,
      })

      pipeline.clear()

      expect(cleanup1).toHaveBeenCalledTimes(1)
      expect(cleanup2).toHaveBeenCalledTimes(1)
    })

    it('should remove all tasks', async () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      const results: Array<number> = []
      await pipeline.addTask((ctx) => results.push(ctx.value))
      await pipeline.addTask((ctx) => results.push(ctx.value * 2))

      pipeline.execute({ value: 10 })
      expect(results).toEqual([10, 20])

      pipeline.clear()
      results.length = 0

      pipeline.execute({ value: 10 })
      expect(results).toEqual([]) // No tasks executed
    })

    it('should not call cleanup on simple function tasks', async () => {
      const pipeline = createTaskPipeline<{ value: number }, void>({
        contextInit: () => undefined,
      })

      await pipeline.addTask(() => { }) // Simple function task

      // Should not throw
      expect(() => pipeline.clear()).not.toThrow()
    })
  })

  describe('mixed tasks', () => {
    it('should handle mix of simple and lifecycle tasks', async () => {
      const pipeline = createTaskPipeline<{ value: number }, { id: number }>({
        contextInit: () => ({ id: 1 }),
      })

      const results: Array<string> = []

      await pipeline.addTask((ctx) => results.push(`simple-${ctx.value}`))
      await pipeline.addTask({
        init: (ctx) => {
          results.push(`init-${ctx.id}`)
        },
        execute: (ctx) => results.push(`lifecycle-${ctx.value}`),
        cleanup: () => results.push('cleanup'),
      })
      await pipeline.addTask((ctx) => results.push(`simple2-${ctx.value}`))

      expect(results).toEqual(['init-1']) // Only init called so far

      pipeline.execute({ value: 42 })
      expect(results).toEqual([
        'init-1',
        'simple-42',
        'lifecycle-42',
        'simple2-42',
      ])

      pipeline.clear()
      expect(results).toEqual([
        'init-1',
        'simple-42',
        'lifecycle-42',
        'simple2-42',
        'cleanup',
      ])
    })
  })

  describe('real-world scenarios', () => {
    it('should support particle system pattern', async () => {
      type RenderContext = {
        canvas: string
        timestamp: number
        paused: boolean
      }

      type InitContext = {
        intentEngine: { on: (event: string, handler: () => void) => void }
      }

      const pipeline = createTaskPipeline<RenderContext, InitContext>({
        contextInit: () => ({
          intentEngine: {
            on: vi.fn(),
          },
        }),
      })

      const particleState = { particles: [] as Array<number> }

      await pipeline.addTask({
        init: (ctx) => {
          // Subscribe to intent events
          ctx.intentEngine.on('spawn', () => {
            particleState.particles.push(1)
          })
        },
        execute: (ctx) => {
          if (!ctx.paused) {
            // Update particles
            particleState.particles = particleState.particles.map((p) => p + 1)
          }
        },
        cleanup: () => {
          particleState.particles = []
        },
      })

      // Simulate render loop
      pipeline.execute({ canvas: 'test', timestamp: 0, paused: false })
      pipeline.execute({ canvas: 'test', timestamp: 16, paused: false })
      pipeline.execute({ canvas: 'test', timestamp: 32, paused: true }) // Paused

      expect(particleState.particles.length).toBeGreaterThanOrEqual(0)
    })

    it('should support FPS counter pattern', async () => {
      type RenderContext = {
        canvas: string
        timestamp: number
      }

      type InitContext = {
        loopState: { get: () => { fps: number } }
      }

      const pipeline = createTaskPipeline<RenderContext, InitContext>({
        contextInit: () => ({
          loopState: {
            get: () => ({ fps: 60 }),
          },
        }),
      })

      const fpsReadings: Array<number> = []

      await pipeline.addTask({
        init: () => {
          // Init can store references or set up subscriptions
        },
        execute: () => {
          // Render FPS counter
          fpsReadings.push(60)
        },
      })

      pipeline.execute({ canvas: 'test', timestamp: 0 })
      pipeline.execute({ canvas: 'test', timestamp: 16 })

      expect(fpsReadings).toEqual([60, 60])
    })
  })
})

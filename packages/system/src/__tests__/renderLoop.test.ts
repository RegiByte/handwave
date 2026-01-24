/**
 * Render Loop Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderLoop } from '@handwave/system'

// Mock requestAnimationFrame
let rafCallback: ((timestamp: number) => void) | null = null
let currentTimestamp = 0

const mockRAF = vi.fn((callback: (timestamp: number) => void) => {
  rafCallback = callback
  return ++currentTimestamp // Use currentTimestamp as rafId
})

const mockCancelRAF = vi.fn((_id: number) => {
  rafCallback = null
})

// Helper to trigger RAF callbacks
const triggerRAF = (deltaMs = 16) => {
  if (rafCallback) {
    currentTimestamp += deltaMs
    const cb = rafCallback
    rafCallback = null // Clear before calling (will be re-set by tick)
    cb(currentTimestamp)
  }
}

describe('createRenderLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    rafCallback = null
    currentTimestamp = 0
    global.requestAnimationFrame = mockRAF
    global.cancelAnimationFrame = mockCancelRAF
    mockRAF.mockClear()
    mockCancelRAF.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rafCallback = null
  })

  it('should create a render loop', () => {
    const loop = createRenderLoop({
      createContext: () => ({ count: 0 }),
    })

    expect(loop).toBeDefined()
    expect(loop.start).toBeInstanceOf(Function)
    expect(loop.stop).toBeInstanceOf(Function)
    expect(loop.pause).toBeInstanceOf(Function)
    expect(loop.resume).toBeInstanceOf(Function)
    expect(loop.isRunning).toBeInstanceOf(Function)
    expect(loop.isPaused).toBeInstanceOf(Function)
  })

  it('should start and stop the loop', () => {
    const loop = createRenderLoop({
      createContext: () => ({ count: 0 }),
    })

    expect(loop.isRunning()).toBe(false)

    loop.start()
    expect(loop.isRunning()).toBe(true)

    loop.stop()
    expect(loop.isRunning()).toBe(false)
  })

  it('should call beforeRender and afterRender hooks', () => {
    const beforeRender = vi.fn()
    const afterRender = vi.fn()

    const loop = createRenderLoop({
      createContext: () => ({ count: 0 }),
      beforeRender,
      afterRender,
    })

    loop.start()

    // Check that RAF was called
    expect(mockRAF).toHaveBeenCalled()
    expect(rafCallback).not.toBeNull()

    // Trigger RAF
    triggerRAF(16)

    expect(beforeRender).toHaveBeenCalled()
    expect(afterRender).toHaveBeenCalled()

    loop.stop()
  })

  it('should pass context, timestamp, and deltaMs to hooks', () => {
    const context = { count: 0 }
    const beforeRender = vi.fn()
    const afterRender = vi.fn()

    const loop = createRenderLoop({
      createContext: () => context,
      beforeRender,
      afterRender,
    })

    loop.start()

    // Trigger RAF
    triggerRAF(16)

    expect(beforeRender).toHaveBeenCalledWith(
      context,
      expect.any(Number),
      expect.any(Number),
    )
    expect(afterRender).toHaveBeenCalledWith(
      context,
      expect.any(Number),
      expect.any(Number),
    )

    loop.stop()
  })

  it('should pause and resume the loop', () => {
    const beforeRender = vi.fn()

    const loop = createRenderLoop({
      createContext: () => ({ count: 0 }),
      beforeRender,
    })

    loop.start()
    expect(loop.isRunning()).toBe(true)
    expect(loop.isPaused()).toBe(false)

    loop.pause()
    expect(loop.isRunning()).toBe(true)
    expect(loop.isPaused()).toBe(true)

    // Trigger RAF - should not call hooks while paused
    beforeRender.mockClear()
    triggerRAF(16)
    expect(beforeRender).not.toHaveBeenCalled()

    loop.resume()
    expect(loop.isRunning()).toBe(true)
    expect(loop.isPaused()).toBe(false)

    // Trigger RAF - should call hooks after resume
    triggerRAF(16)
    expect(beforeRender).toHaveBeenCalled()

    loop.stop()
  })

  it('should handle errors with onError handler', () => {
    const onError = vi.fn()
    const error = new Error('Test error')

    const loop = createRenderLoop({
      createContext: () => ({ count: 0 }),
      beforeRender: () => {
        throw error
      },
      onError,
    })

    loop.start()

    // Trigger RAF
    triggerRAF(16)

    expect(onError).toHaveBeenCalledWith(error)

    loop.stop()
  })

  it('should log errors to console if no onError handler', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { })
    const error = new Error('Test error')

    const loop = createRenderLoop({
      createContext: () => ({ count: 0 }),
      beforeRender: () => {
        throw error
      },
    })

    loop.start()

    // Trigger RAF
    triggerRAF(16)

    expect(consoleError).toHaveBeenCalled()

    loop.stop()
  })

  it('should be idempotent when calling start multiple times', () => {
    const beforeRender = vi.fn()

    const loop = createRenderLoop({
      createContext: () => ({ count: 0 }),
      beforeRender,
    })

    loop.start()
    loop.start()
    loop.start()

    expect(loop.isRunning()).toBe(true)

    // Trigger RAF - should only call once per frame
    triggerRAF(16)
    expect(beforeRender).toHaveBeenCalledTimes(1)

    loop.stop()
  })

  it('should return context via getContext', () => {
    const context = { count: 42 }

    const loop = createRenderLoop({
      createContext: () => context,
    })

    expect(loop.getContext()).toBe(null)

    loop.start()
    expect(loop.getContext()).toBe(context)

    loop.stop()
  })

  it('should throttle FPS when targetFPS is specified', () => {
    const beforeRender = vi.fn()

    const loop = createRenderLoop({
      createContext: () => ({ count: 0 }),
      beforeRender,
      targetFPS: 30, // 30 FPS = 33.333ms per frame
    })

    loop.start()

    // First frame should execute (deltaMs = 0, first frame always executes)
    triggerRAF(10)
    expect(beforeRender).toHaveBeenCalledTimes(1)
    beforeRender.mockClear()

    // Second frame too soon (deltaMs = 10ms < 33.333ms), should skip
    triggerRAF(10)
    expect(beforeRender).not.toHaveBeenCalled()

    // Third frame too soon (deltaMs = 20ms < 33.333ms), should skip
    triggerRAF(10)
    expect(beforeRender).not.toHaveBeenCalled()

    // Fourth frame too soon (deltaMs = 30ms < 33.333ms), should skip
    triggerRAF(10)
    expect(beforeRender).not.toHaveBeenCalled()

    // Fifth frame (deltaMs = 40ms >= 33.333ms), should execute
    triggerRAF(10)
    expect(beforeRender).toHaveBeenCalledTimes(1)

    loop.stop()
  })

  it('should reset lastTimestamp on resume', () => {
    const beforeRender = vi.fn()

    const loop = createRenderLoop({
      createContext: () => ({ count: 0 }),
      beforeRender: (_ctx, _timestamp, deltaMs) => {
        beforeRender(deltaMs)
      },
    })

    loop.start()

    // First frame
    triggerRAF(16)
    expect(beforeRender).toHaveBeenCalledWith(0) // First frame deltaMs = 0

    // Second frame
    beforeRender.mockClear()
    triggerRAF(16)
    expect(beforeRender).toHaveBeenCalledWith(expect.any(Number))

    // Pause and resume
    loop.pause()
    loop.resume()

    // After resume, deltaMs should reset to 0
    beforeRender.mockClear()
    triggerRAF(16)
    expect(beforeRender).toHaveBeenCalledWith(0)

    loop.stop()
  })
})

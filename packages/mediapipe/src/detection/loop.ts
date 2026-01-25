/**
 * Loop Resource
 *
 * Main render loop for MediaPipe visualization.
 * Worker-driven architecture: worker runs detection independently,
 * main thread sends frames and handles rendering at 60 FPS.
 *
 * Flow:
 *   1. Main thread creates ImageBitmap from video
 *   2. Main thread sends bitmap to worker via pushFrame (zero-copy transfer)
 *   3. Worker runs MediaPipe detection at its own rate
 *   4. Worker sends results back via subscription
 *   5. Main thread renders results to visible canvas
 */

import type { StartedResource } from 'braided'
import { defineResource } from 'braided'
import type { EnrichedDetectionFrame, RawDetectionFrame } from '@handwave/intent-engine'
import { enrichDetectionFrame } from '@handwave/intent-engine'
import { createAtom, createRenderLoop, createSubscription, createTaskPipeline } from '@handwave/system'
import type { CameraAPI } from './camera'
import type { CanvasAPI } from './canvas'
import type { DetectionWorkerResource } from './detectionWorker'
import type { FrameRaterAPI } from './frameRater'
import type { RenderContext, RenderTask } from '../tasks/types'

// Frame data emitted each tick
export type FrameData = {
  timestamp: number
  video: HTMLVideoElement
  detectionFrame: RawDetectionFrame | null
  enrichedDetectionFrame: EnrichedDetectionFrame | null
}

export type LoopState = {
  running: boolean
  paused: boolean
  mirrored: boolean
  fps: number
  workerFPS: number
  frameCount: number
  shouldRender: {
    videoForeground: boolean
  }
}

export type LoopDependencies = {
  camera: CameraAPI & { state: ReturnType<typeof createAtom<any>> }
  detectionWorker: DetectionWorkerResource
  canvas: CanvasAPI
  frameRater: FrameRaterAPI
}

/**
 * Loop context for createRenderLoop
 */
type LoopContext = {
  // Canvas resource (access width/height dynamically for resize support)
  canvas: CanvasAPI

  // Video source
  video: HTMLVideoElement

  // Camera state (for stream version tracking)
  cameraState: ReturnType<typeof createAtom<any>>

  // Detection worker
  detectionWorker: DetectionWorkerResource

  // Frame raters (rate limiting)
  frameRaters: {
    rendering: ReturnType<FrameRaterAPI['variable']>
    videoStreamUpdate: ReturnType<FrameRaterAPI['throttled']>
    framePush: ReturnType<FrameRaterAPI['throttled']>
    backdrop: ReturnType<FrameRaterAPI['throttled']>
  }

  // Render pipeline
  renderPipeline: ReturnType<typeof createTaskPipeline<RenderContext, void>>

  // Offscreen canvas for video caching
  offscreenCanvas: HTMLCanvasElement
  offscreenCtx: CanvasRenderingContext2D

  // Mutable state (updated during loop)
  cachedFrameData: {
    detectionFrame: RawDetectionFrame | null
    enrichedDetectionFrame: EnrichedDetectionFrame | null
    viewport: { x: number; y: number; width: number; height: number } | null
  }

  lastViewport: { x: number; y: number; width: number; height: number } | null
  lastUpdateTimestamp: number
  lastStreamVersion: number

  // Frame push tracking for metrics
  framePushState: {
    lastPushTimestamp: number
    lastFrameCreationMs: number
    totalFramesPushed: number
    totalFrameCreationMs: number
  }

  // Subscriptions
  frame$: ReturnType<typeof createSubscription<FrameData>>

  // State atom (accessed directly, not cached)
  state: ReturnType<typeof createAtom<LoopState>>
}

/**
 * Calculate viewport that maintains video aspect ratio within canvas
 */
const calculateViewport = (
  videoWidth: number,
  videoHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; width: number; height: number } => {
  if (videoWidth === 0 || videoHeight === 0) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  }

  const videoAspect = videoWidth / videoHeight
  const canvasAspect = canvasWidth / canvasHeight

  let viewportWidth: number
  let viewportHeight: number

  if (canvasAspect > videoAspect) {
    viewportHeight = canvasHeight
    viewportWidth = canvasHeight * videoAspect
  } else {
    viewportWidth = canvasWidth
    viewportHeight = canvasWidth / videoAspect
  }

  const x = (canvasWidth - viewportWidth) / 2
  const y = (canvasHeight - viewportHeight) / 2

  return { x, y, width: viewportWidth, height: viewportHeight }
}

const createFrameRaters = (frameRater: FrameRaterAPI) => {
  return {
    rendering: frameRater.variable('rendering', {
      targetFPS: 60,
      smoothingWindow: 10,
      maxDeltaMs: 100,
    }),
    videoStreamUpdate: frameRater.throttled('videoStreamUpdate', {
      intervalMs: 1000 / 30,
    }),
    framePush: frameRater.throttled('framePush', {
      intervalMs: 1000 / 25, // Push frames at 30 FPS
    }),
    backdrop: frameRater.throttled('backdrop', {
      intervalMs: 1000 / 5,
    }),
  }
}

type LoopFrameRaterKey = 'backdrop' | 'videoStreamUpdate'
type LoopShouldRun = Record<LoopFrameRaterKey, boolean>

/**
 * Update phase - sends frames to worker (synchronous, fire-and-forget)
 */
const update = (context: LoopContext, timestamp: number, deltaMs: number) => {
  const video = context.video
  const isPaused = context.state.get().paused

  const hasVideoFrame =
    video.videoWidth > 0 &&
    video.videoHeight > 0 &&
    context.canvas.width > 0 &&
    context.canvas.height > 0

  // Handle stream version changes
  const currentStreamVersion = context.cameraState.get().streamVersion ?? 0
  if (currentStreamVersion !== context.lastStreamVersion) {
    context.lastStreamVersion = currentStreamVersion
    context.cachedFrameData = {
      detectionFrame: null,
      enrichedDetectionFrame: null,
      viewport: null,
    }
    context.frameRaters.videoStreamUpdate.reset()
    context.frameRaters.framePush.reset()
    context.frameRaters.rendering.reset()
  }

  // Update FPS
  const currentFps = Math.round(context.frameRaters.rendering.getFPS())
  if (currentFps !== context.state.get().fps) {
    context.state.mutate((s) => {
      s.fps = currentFps
      s.frameCount += 1
    })
  }

  const shouldRun: LoopShouldRun = {
    backdrop: false,
    videoStreamUpdate:
      !isPaused && context.frameRaters.videoStreamUpdate.shouldExecute(deltaMs),
  }

  // Check if we should push frame (constant stream, no backpressure)
  const timeSinceLastPush = timestamp - context.framePushState.lastPushTimestamp
  const shouldPushFrame =
    !isPaused &&
    context.frameRaters.framePush.shouldExecute(deltaMs)

  const executed: Partial<Record<LoopFrameRaterKey, boolean>> = {}

  // Push frame to worker for detection (constant stream)
  if (hasVideoFrame && shouldPushFrame && context.detectionWorker.isInitialized()) {
    const frameStartTime = performance.now()

    try {
      // Create VideoFrame from video (244x faster than ImageBitmap!)
      // VideoFrame expects timestamp in microseconds
      const videoFrame = new VideoFrame(video, { timestamp: timestamp * 1000 })
      const frameCreationMs = performance.now() - frameStartTime

      // Track metrics
      context.framePushState.lastFrameCreationMs = frameCreationMs
      context.framePushState.totalFrameCreationMs += frameCreationMs
      context.framePushState.totalFramesPushed += 1

      // Log metrics every 60 frames (~2 seconds at 30 FPS)
      if (context.framePushState.totalFramesPushed % 60 === 0) {
        const avgFrameMs = context.framePushState.totalFrameCreationMs / context.framePushState.totalFramesPushed
        const workerFPS = context.state.get().workerFPS
        const mainFPS = context.state.get().fps

        console.log('[Loop Metrics]', {
          avgFrameCreationMs: avgFrameMs.toFixed(2),
          lastFrameMs: frameCreationMs.toFixed(2),
          timeSinceLastPush: timeSinceLastPush.toFixed(2),
          workerFPS,
          mainFPS,
          totalFramesPushed: context.framePushState.totalFramesPushed,
        })
      }

      // Send to worker (zero-copy transfer)
      context.detectionWorker.pushFrame(videoFrame, timestamp)
      context.framePushState.lastPushTimestamp = timestamp

      context.frameRaters.framePush.recordExecution()
    } catch (error) {
      console.warn('[Loop] Failed to push frame:', error)
    }
  }

  // Cache video frame for rendering (when paused)
  // Draw directly to offscreen canvas - no ImageBitmap creation needed!
  if (!isPaused && hasVideoFrame && shouldRun.videoStreamUpdate) {
    const cacheViewport = calculateViewport(
      video.videoWidth,
      video.videoHeight,
      context.canvas.width,
      context.canvas.height,
    )

    if (
      context.offscreenCanvas.width !== context.canvas.width ||
      context.offscreenCanvas.height !== context.canvas.height
    ) {
      context.offscreenCanvas.width = context.canvas.width
      context.offscreenCanvas.height = context.canvas.height
    }

    context.offscreenCtx.clearRect(
      0,
      0,
      context.offscreenCanvas.width,
      context.offscreenCanvas.height,
    )

    if (context.state.get().mirrored) {
      context.offscreenCtx.save()
      context.offscreenCtx.translate(
        cacheViewport.x + cacheViewport.width,
        cacheViewport.y,
      )
      context.offscreenCtx.scale(-1, 1)
      context.offscreenCtx.drawImage(
        video,
        0,
        0,
        cacheViewport.width,
        cacheViewport.height,
      )
      context.offscreenCtx.restore()
    } else {
      context.offscreenCtx.drawImage(
        video,
        cacheViewport.x,
        cacheViewport.y,
        cacheViewport.width,
        cacheViewport.height,
      )
    }

    // Store viewport for paused rendering - no ImageBitmap needed!
    context.cachedFrameData.viewport = cacheViewport
    executed.videoStreamUpdate = true
  }

  if (!hasVideoFrame) {
    context.cachedFrameData.detectionFrame = null
  }

  if (executed.videoStreamUpdate) {
    context.frameRaters.videoStreamUpdate.recordExecution()
  }
}

/**
 * Render phase - reads detection results and executes render pipeline
 */
const renderFrame = (context: LoopContext, timestamp: number, deltaMs: number) => {
  const video = context.video
  const loopState = context.state.get()
  const isPaused = loopState.paused
  const shouldRender = loopState.shouldRender

  const viewport = calculateViewport(
    video.videoWidth,
    video.videoHeight,
    context.canvas.width,
    context.canvas.height,
  )

  // Sync viewport to worker when it changes
  if (
    !context.lastViewport ||
    context.lastViewport.x !== viewport.x ||
    context.lastViewport.y !== viewport.y ||
    context.lastViewport.width !== viewport.width ||
    context.lastViewport.height !== viewport.height
  ) {
    context.lastViewport = { ...viewport }
    context.detectionWorker.updateViewport(viewport)
  }

  if (
    context.offscreenCanvas.width !== context.canvas.width ||
    context.offscreenCanvas.height !== context.canvas.height
  ) {
    context.offscreenCanvas.width = context.canvas.width
    context.offscreenCanvas.height = context.canvas.height
  }

  // Read detection results from SharedArrayBuffer if enabled (zero-copy!)
  // This happens every render frame - no message passing overhead
  if (context.detectionWorker.isSharedBufferEnabled()) {
    const sharedResults = context.detectionWorker.readDetectionResults()
    if (sharedResults) {
      // Update cached frame data with canonical detection frame
      context.cachedFrameData.detectionFrame = sharedResults.detectionFrame
      context.cachedFrameData.enrichedDetectionFrame = enrichDetectionFrame(sharedResults.detectionFrame)
      // Update worker FPS in state
      const currentWorkerFPS = Math.round(sharedResults.workerFPS)
      if (currentWorkerFPS !== context.state.get().workerFPS) {
        context.state.mutate((s) => {
          s.workerFPS = currentWorkerFPS
        })
      }

      // Emit frame event for subscribers (e.g., recording resource)
      context.frame$.notify({
        timestamp: sharedResults.timestamp,
        video,
        detectionFrame: sharedResults.detectionFrame,
        enrichedDetectionFrame: context.cachedFrameData.enrichedDetectionFrame,
      })
    }
  }

  const shouldRunBackdrop = context.frameRaters.backdrop.shouldExecute(deltaMs)
  const renderExecuted: Partial<Record<LoopFrameRaterKey, boolean>> = {}

  const renderContext = {
    ctx: context.canvas.ctx,
    drawer: context.canvas.drawer,
    width: context.canvas.width,
    height: context.canvas.height,
    video,
    detectionFrame: context.cachedFrameData.enrichedDetectionFrame,
    timestamp,
    deltaMs,
    mirrored: context.state.get().mirrored,
    paused: isPaused,
    viewport,
    cachedViewport: context.cachedFrameData.viewport,
    frameRaters: context.frameRaters,
    shouldRun: {
      backdrop: shouldRunBackdrop,
      videoStreamUpdate: false,
    },
    shouldRender: shouldRender,
    recordExecution: (key: LoopFrameRaterKey) => {
      renderExecuted[key] = true
    },
    offscreenCtx: context.offscreenCtx,
    offscreenCanvas: context.offscreenCanvas,
  } satisfies RenderContext

  // Execute all render tasks through the pipeline
  context.renderPipeline.execute(renderContext)

  if (renderExecuted.backdrop) {
    context.frameRaters.backdrop.recordExecution()
  }

  context.frameRaters.rendering.recordFrame(deltaMs)
}

export const loopResource = defineResource({
  dependencies: ['camera', 'detectionWorker', 'canvas', 'frameRater'] as const,
  start: ({
    camera,
    detectionWorker,
    canvas,
    frameRater,
  }: LoopDependencies) => {
    const state = createAtom<LoopState>({
      running: false,
      paused: false,
      mirrored: true,
      fps: 0,
      workerFPS: 0,
      frameCount: 0,
      shouldRender: {
        videoForeground: false,
      },
    })

    const frame$ = createSubscription<FrameData>()
    const workerReady$ = createSubscription<{ mirrored: boolean }>()

    // Create task pipeline for render tasks
    const renderPipeline = createTaskPipeline<RenderContext, void>({
      contextInit: () => undefined,
      onError: (error) => console.error('Render task error:', error),
    })

    /**
     * Initialize worker detection with SharedArrayBuffer
     */
    const initializeWorkerDetection = async () => {
      console.log('[Loop] Initializing worker detection...')

      // Initialize worker (includes SharedArrayBuffer setup)
      await detectionWorker.initialize({
        targetFPS: 30,
        detectFace: true,
        detectHands: true,
      })

      console.log('[Loop] ✅ Using SharedArrayBuffer for zero-copy results')

      // Start detection loop
      detectionWorker.startDetection()

      console.log('[Loop] ✅ Worker detection initialized')
    }

    // Create offscreen canvas for caching video frames
    const offscreenCanvas = document.createElement('canvas')
    const offscreenCtx = offscreenCanvas.getContext('2d', {
      willReadFrequently: true,
    })
    if (!offscreenCtx) {
      throw new Error('Failed to create offscreen canvas context')
    }

    /**
     * Context factory for createRenderLoop
     */
    const createLoopContext = (): LoopContext => ({
      canvas,
      video: camera.video,
      cameraState: camera.state,
      detectionWorker,
      frameRaters: createFrameRaters(frameRater),
      renderPipeline,
      offscreenCanvas,
      offscreenCtx,
      cachedFrameData: {
        detectionFrame: null,
        enrichedDetectionFrame: null,
        viewport: null,
      },
      lastViewport: null,
      lastUpdateTimestamp: 0,
      lastStreamVersion: camera.state.get().streamVersion ?? 0,
      framePushState: {
        lastPushTimestamp: 0,
        lastFrameCreationMs: 0,
        totalFramesPushed: 0,
        totalFrameCreationMs: 0,
      },
      frame$,
      state,
    })

    /**
     * beforeRender hook - update phase (synchronous operations)
     */
    const beforeRender = (context: LoopContext, timestamp: number, deltaMs: number) => {
      context.lastUpdateTimestamp = timestamp

      setTimeout(() => {
        // Synchronous update - no async operations needed!
        try {
          update(context, timestamp, deltaMs)
        } catch (error) {
          console.error('[Loop] Update error:', error)
        }
      }, 0)
    }

    /**
     * afterRender hook - render phase (sync operations)
     */
    const afterRender = (context: LoopContext, timestamp: number, deltaMs: number) => {
      renderFrame(context, timestamp, deltaMs)
    }

    /**
     * Create the render loop
     */
    const renderLoop = createRenderLoop({
      createContext: createLoopContext,
      beforeRender,
      afterRender,
      onError: (error) => console.error('[Loop] Render error:', error),
    })

    const api = {
      state,
      frame$,
      workerReady$,
      renderPipeline,

      start: () => {
        if (state.get().running) return
        state.update((s) => ({ ...s, running: true }))

        // Initialize worker detection on first start
        if (!detectionWorker.isInitialized()) {
          initializeWorkerDetection()
            .then(() => {
              // Emit workerReady event so runtime can sync display context
              console.log('[Loop] Emitting workerReady event...')
              workerReady$.notify({ mirrored: state.get().mirrored })
            })
            .catch((error) => {
              console.error(
                '[Loop] Failed to initialize worker detection:',
                error,
              )
            })
        }

        renderLoop.start()
      },

      stop: () => {
        state.mutate((s) => {
          s.running = false
        })
        renderLoop.stop()
      },

      pause: () => {
        state.update((s) => ({ ...s, paused: true }))
        detectionWorker.sendCommand({ type: 'pause' })
      },

      resume: () => {
        state.update((s) => ({ ...s, paused: false }))
        detectionWorker.sendCommand({ type: 'resume' })
      },

      togglePause: () => {
        const wasPaused = state.get().paused
        if (wasPaused) {
          api.resume()
        } else {
          api.pause()
        }
      },

      toggleMirror: () => {
        state.update((s) => ({ ...s, mirrored: !s.mirrored }))
      },

      setMirrored: (mirrored: boolean) => {
        state.update((s) => ({ ...s, mirrored }))
      },

      addRenderTask: (task: RenderTask) => {
        // Wrap async addTask in a promise that returns the unsubscribe function
        let unsubscribe: (() => void) | null = null
        renderPipeline.addTask(task).then((unsub) => {
          unsubscribe = unsub
        })
        // Return synchronous unsubscribe that waits for init to complete
        return () => {
          if (unsubscribe) {
            unsubscribe()
          }
        }
      },

      toggleRendering: (key: 'videoForeground') => {
        state.update((s) => ({
          ...s,
          shouldRender: {
            ...s.shouldRender,
            [key]: !s.shouldRender[key as keyof typeof s.shouldRender],
          },
        }))
      },
    }

    return api
  },
  halt: (loop) => {
    loop.stop()
    loop.frame$.clear()
    loop.workerReady$.clear()
    loop.renderPipeline.clear()
  },
})

export type LoopResource = StartedResource<typeof loopResource>

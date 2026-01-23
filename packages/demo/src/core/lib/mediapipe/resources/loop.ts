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
import type {
  FaceLandmarkerResult,
  GestureRecognizerResult,
} from '@mediapipe/tasks-vision'
import { createAtom, createSubscription, createTaskPipeline } from '@handwave/system'
import type { CameraAPI } from './camera'
import type { CanvasAPI } from './canvas'
import type { DetectionWorkerResource } from './detectionWorker'
import type { FrameRaterAPI } from './frameRater'
import type { RenderContext, RenderTask } from './tasks/types'

// Frame data emitted each tick
export type FrameData = {
  timestamp: number
  video: HTMLVideoElement
  faceResult: FaceLandmarkerResult | null
  gestureResult: GestureRecognizerResult | null
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
      intervalMs: 1000 / 30, // Push frames at 30 FPS
    }),
    backdrop: frameRater.throttled('backdrop', {
      intervalMs: 1000 / 5,
    }),
  }
}

type LoopFrameRaterKey = 'backdrop' | 'videoStreamUpdate'
type LoopShouldRun = Record<LoopFrameRaterKey, boolean>

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

    let rafId: number | null = null
    let lastRenderTimestamp = performance.now()
    let lastUpdateTimestamp = performance.now()
    let lastStreamVersion = camera.state.get().streamVersion ?? 0

    // Cached frame data
    let cachedFrameData: {
      faceResult: FaceLandmarkerResult | null
      gestureResult: GestureRecognizerResult | null
      videoFrame: ImageBitmap | null
      viewport: { x: number; y: number; width: number; height: number } | null
    } = {
      faceResult: null,
      gestureResult: null,
      videoFrame: null,
      viewport: null,
    }

    const frameRaters = createFrameRaters(frameRater)

    // Track last viewport for sync to worker
    let lastViewport: { x: number; y: number; width: number; height: number } | null = null

    // Offscreen canvas for caching video frames
    const offscreenCanvas = document.createElement('canvas')
    const offscreenCtx = offscreenCanvas.getContext('2d', {
      willReadFrequently: true,
    })
    if (!offscreenCtx) {
      throw new Error('Failed to create offscreen canvas context')
    }

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

    // Update loop - sends frames to worker
    const updateAsync = async () => {
      if (!state.get().running) return

      const timestamp = performance.now()
      const deltaMs = timestamp - lastUpdateTimestamp
      lastUpdateTimestamp = timestamp

      const video = camera.video
      const isPaused = state.get().paused

      const hasVideoFrame =
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        canvas.width > 0 &&
        canvas.height > 0

      // Handle stream version changes
      const currentStreamVersion = camera.state.get().streamVersion ?? 0
      if (currentStreamVersion !== lastStreamVersion) {
        lastStreamVersion = currentStreamVersion
        if (cachedFrameData.videoFrame) {
          cachedFrameData.videoFrame.close()
        }
        cachedFrameData = {
          faceResult: null,
          gestureResult: null,
          videoFrame: null,
          viewport: null,
        }
        frameRaters.videoStreamUpdate.reset()
        frameRaters.framePush.reset()
        frameRaters.rendering.reset()
      }

      // Update FPS
      const currentFps = Math.round(frameRaters.rendering.getFPS())
      if (currentFps !== state.get().fps) {
        state.mutate((s) => {
          s.fps = currentFps
          s.frameCount += 1
        })
      }

      const shouldRun: LoopShouldRun = {
        backdrop: false,
        videoStreamUpdate:
          !isPaused && frameRaters.videoStreamUpdate.shouldExecute(deltaMs),
      }

      const shouldPushFrame =
        !isPaused && frameRaters.framePush.shouldExecute(deltaMs)

      const executed: Partial<Record<LoopFrameRaterKey, boolean>> = {}

      // Push frame to worker for detection
      if (hasVideoFrame && shouldPushFrame && detectionWorker.isInitialized()) {
        try {
          // Create ImageBitmap from video
          const bitmap = await createImageBitmap(video)

          // Send to worker (zero-copy transfer)
          detectionWorker.pushFrame(bitmap, timestamp)

          frameRaters.framePush.recordExecution()
        } catch (error) {
          console.warn('[Loop] Failed to push frame:', error)
        }
      }

      // Cache video frame for rendering
      if (!isPaused && hasVideoFrame && shouldRun.videoStreamUpdate) {
        const cacheViewport = calculateViewport(
          video.videoWidth,
          video.videoHeight,
          canvas.width,
          canvas.height,
        )

        if (
          offscreenCanvas.width !== canvas.width ||
          offscreenCanvas.height !== canvas.height
        ) {
          offscreenCanvas.width = canvas.width
          offscreenCanvas.height = canvas.height
        }

        offscreenCtx.clearRect(
          0,
          0,
          offscreenCanvas.width,
          offscreenCanvas.height,
        )

        if (state.get().mirrored) {
          offscreenCtx.save()
          offscreenCtx.translate(
            cacheViewport.x + cacheViewport.width,
            cacheViewport.y,
          )
          offscreenCtx.scale(-1, 1)
          offscreenCtx.drawImage(
            video,
            0,
            0,
            cacheViewport.width,
            cacheViewport.height,
          )
          offscreenCtx.restore()
        } else {
          offscreenCtx.drawImage(
            video,
            cacheViewport.x,
            cacheViewport.y,
            cacheViewport.width,
            cacheViewport.height,
          )
        }

        try {
          if (cachedFrameData.videoFrame) {
            cachedFrameData.videoFrame.close()
          }
          cachedFrameData.videoFrame = await createImageBitmap(
            offscreenCanvas,
            cacheViewport.x,
            cacheViewport.y,
            cacheViewport.width,
            cacheViewport.height,
          )
          cachedFrameData.viewport = cacheViewport
          executed.videoStreamUpdate = true
        } catch (error) {
          console.warn('Failed to cache video frame:', error)
        }
      }

      if (!hasVideoFrame) {
        cachedFrameData.faceResult = null
        cachedFrameData.gestureResult = null
      }

      if (executed.videoStreamUpdate) {
        frameRaters.videoStreamUpdate.recordExecution()
      }
    }

    const update = () => {
      updateAsync().catch((error) => {
        console.error('Update error:', error)
      })
    }

    // Render loop
    const render = () => {
      if (!state.get().running) return

      const timestamp = performance.now()
      const deltaMs = timestamp - lastRenderTimestamp
      lastRenderTimestamp = timestamp

      const video = camera.video
      const loopState = state.get()
      const isPaused = loopState.paused
      const shouldRender = loopState.shouldRender

      canvas.clear()

      const viewport = calculateViewport(
        video.videoWidth,
        video.videoHeight,
        canvas.width,
        canvas.height,
      )

      // Sync viewport to worker when it changes
      if (
        !lastViewport ||
        lastViewport.x !== viewport.x ||
        lastViewport.y !== viewport.y ||
        lastViewport.width !== viewport.width ||
        lastViewport.height !== viewport.height
      ) {
        lastViewport = { ...viewport }
        detectionWorker.updateViewport(viewport)
      }

      if (
        offscreenCanvas.width !== canvas.width ||
        offscreenCanvas.height !== canvas.height
      ) {
        offscreenCanvas.width = canvas.width
        offscreenCanvas.height = canvas.height
      }

      // Read detection results from SharedArrayBuffer if enabled (zero-copy!)
      // This happens every render frame - no message passing overhead
      if (detectionWorker.isSharedBufferEnabled()) {
        const sharedResults = detectionWorker.readDetectionResults()
        if (sharedResults) {
          // Update cached frame data with results from SharedArrayBuffer
          cachedFrameData.faceResult = sharedResults.faceResult
          cachedFrameData.gestureResult = sharedResults.gestureResult

          // Update worker FPS in state
          const currentWorkerFPS = Math.round(sharedResults.workerFPS)
          if (currentWorkerFPS !== state.get().workerFPS) {
            state.mutate((s) => {
              s.workerFPS = currentWorkerFPS
            })
          }

          // Emit frame event for subscribers (e.g., recording resource)
          frame$.notify({
            timestamp: sharedResults.timestamp,
            video,
            faceResult: sharedResults.faceResult,
            gestureResult: sharedResults.gestureResult,
          })
        }
      }

      const shouldRunBackdrop = frameRaters.backdrop.shouldExecute(deltaMs)
      const renderExecuted: Partial<Record<LoopFrameRaterKey, boolean>> = {}

      const renderContext = {
        ctx: canvas.ctx,
        drawer: canvas.drawer,
        width: canvas.width,
        height: canvas.height,
        video,
        faceResult: cachedFrameData.faceResult,
        gestureResult: cachedFrameData.gestureResult,
        timestamp,
        deltaMs,
        mirrored: state.get().mirrored,
        paused: isPaused,
        cachedVideoFrame: cachedFrameData?.videoFrame ?? null,
        viewport,
        cachedViewport: cachedFrameData.viewport,
        frameRaters,
        shouldRun: {
          backdrop: shouldRunBackdrop,
          videoStreamUpdate: false,
        },
        shouldRender: shouldRender,
        recordExecution: (key: LoopFrameRaterKey) => {
          renderExecuted[key] = true
        },
        offscreenCtx,
      } satisfies RenderContext

      // Execute all render tasks through the pipeline
      renderPipeline.execute(renderContext)

      if (renderExecuted.backdrop) {
        frameRaters.backdrop.recordExecution()
      }

      frameRaters.rendering.recordFrame(deltaMs)
    }

    const tick = () => {
      update()
      render()
      rafId = requestAnimationFrame(tick)
    }

    const api = {
      state,
      frame$,
      workerReady$,
      renderPipeline,

      start: () => {
        if (state.get().running) return
        state.update((s) => ({ ...s, running: true }))
        lastRenderTimestamp = performance.now()
        lastUpdateTimestamp = performance.now()

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

        rafId = requestAnimationFrame(tick)
      },

      stop: () => {
        state.mutate((s) => {
          s.running = false
        })
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
        if (cachedFrameData.videoFrame) {
          cachedFrameData.videoFrame.close()
          cachedFrameData.videoFrame = null
        }
      },

      pause: () => {
        state.update((s) => ({ ...s, paused: true }))
        detectionWorker.sendCommand({ type: 'pause' })
      },

      resume: () => {
        state.update((s) => ({ ...s, paused: false }))
        lastRenderTimestamp = performance.now()
        lastUpdateTimestamp = performance.now()
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

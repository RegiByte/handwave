import { defineResource } from 'braided'
import type {
  FaceLandmarkerResult,
  GestureRecognizerResult,
} from '@mediapipe/tasks-vision'
import { createAtom, createSubscription } from '../../state'
import type { CameraAPI } from './camera'
import type { FaceLandmarkerAPI } from './face-landmarker'
import type { GestureRecognizerAPI } from './gesture-recognizer'
import type { CanvasAPI } from './canvas'
import type { FrameRaterAPI } from './frameRater'

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
  frameCount: number
}

export type RenderContext = {
  ctx: CanvasRenderingContext2D
  drawer: CanvasAPI['drawer']
  width: number
  height: number
  video: HTMLVideoElement
  faceResult: FaceLandmarkerResult | null
  gestureResult: GestureRecognizerResult | null
  timestamp: number
  deltaMs: number
  mirrored: boolean
  paused: boolean
  cachedVideoFrame: ImageBitmap | null
  // Viewport for video rendering (respects aspect ratio)
  viewport: {
    x: number
    y: number
    width: number
    height: number
  }
  // Cached viewport (when landmarks were captured)
  cachedViewport: {
    x: number
    y: number
    width: number
    height: number
  } | null
  // Frame raters for different execution rates
  frameRaters: LoopFrameRaters
  // Precomputed per-tick decisions
  shouldRun: LoopShouldRun
  // Record which tasks actually executed work this tick
  recordExecution: (key: LoopFrameRaterKey) => void
  offscreenCtx: CanvasRenderingContext2D
}

export type RenderTask = (context: RenderContext) => void

export type LoopAPI = {
  state: ReturnType<typeof createAtom<LoopState>>
  frame$: ReturnType<typeof createSubscription<FrameData>>
  start: () => void
  stop: () => void
  /**
   * Pause frame capture (keeps rendering last frame)
   */
  pause: () => void
  /**
   * Resume frame capture
   */
  resume: () => void
  /**
   * Toggle pause state
   */
  togglePause: () => void
  /**
   * Toggle mirrored/selfie mode
   */
  toggleMirror: () => void
  /**
   * Set mirrored mode explicitly
   */
  setMirrored: (mirrored: boolean) => void
  /**
   * Add a render task to the loop
   * Returns an unsubscribe function
   */
  addRenderTask: (task: RenderTask) => () => void
}

export type LoopDependencies = {
  camera: CameraAPI & { state: ReturnType<typeof createAtom<any>> }
  faceLandmarker: FaceLandmarkerAPI
  gestureRecognizer: GestureRecognizerAPI
  canvas: CanvasAPI
  frameRater: FrameRaterAPI
}

/**
 * Calculate viewport that maintains video aspect ratio within canvas
 * Returns centered rectangle with letterboxing/pillarboxing as needed
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
    // Canvas is wider - pillarbox (black bars on sides)
    viewportHeight = canvasHeight
    viewportWidth = canvasHeight * videoAspect
  } else {
    // Canvas is taller - letterbox (black bars on top/bottom)
    viewportWidth = canvasWidth
    viewportHeight = canvasWidth / videoAspect
  }

  const x = (canvasWidth - viewportWidth) / 2
  const y = (canvasHeight - viewportHeight) / 2

  return { x, y, width: viewportWidth, height: viewportHeight }
}

const createFrameRaters = (frameRater: FrameRaterAPI) => {
  return {
    // Variable timestep for rendering - never skip frames
    rendering: frameRater.variable('rendering', {
      targetFPS: 60,
      smoothingWindow: 10,
      maxDeltaMs: 100,
    }),
    // Throttled for expensive data updates only
    videoStreamUpdate: frameRater.throttled('videoStreamUpdate', {
      intervalMs: 1000 / 30, // 30 FPS - cache video frame
    }),
    faceDetection: frameRater.throttled('faceDetection', {
      intervalMs: 1000 / 30, // 30 FPS
    }),
    gestureDetection: frameRater.throttled('gestureDetection', {
      intervalMs: 1000 / 30, // 30 FPS
    }),
    backdrop: frameRater.throttled('backdrop', {
      intervalMs: 1000 / 5, // 5 FPS
    }),
  }
}

type LoopFrameRaters = ReturnType<typeof createFrameRaters>
type LoopFrameRaterKey =
  | 'backdrop'
  | 'videoStreamUpdate'
  | 'faceDetection'
  | 'gestureDetection'
type LoopShouldRun = Record<LoopFrameRaterKey, boolean>

export const loopResource = defineResource({
  dependencies: [
    'camera',
    'faceLandmarker',
    'gestureRecognizer',
    'canvas',
    'frameRater',
  ] as const,
  start: ({
    camera,
    faceLandmarker,
    gestureRecognizer,
    canvas,
    frameRater,
  }: LoopDependencies) => {
    const state = createAtom<LoopState>({
      running: false,
      paused: false,
      mirrored: true, // Selfie mode on by default
      fps: 0,
      frameCount: 0,
    })

    const frame$ = createSubscription<FrameData>()
    const renderTasks = new Set<RenderTask>()

    let rafId: number | null = null
    // let updateIntervalId: number | null = null
    let lastRenderTimestamp = performance.now()
    let lastUpdateTimestamp = performance.now()
    let lastStreamVersion = camera.state.get().streamVersion ?? 0

    // Cached frame data when paused / throttled updates
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

    // Reusable offscreen canvas for expensive operations
    const offscreenCanvas = document.createElement('canvas')
    const offscreenCtx = offscreenCanvas.getContext('2d', {
      willReadFrequently: true,
    })
    if (!offscreenCtx) {
      throw new Error('Failed to create offscreen canvas context')
    }

    // Update loop - runs at fixed interval for data processing
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

      const currentStreamVersion = camera.state.get().streamVersion ?? 0
      if (currentStreamVersion !== lastStreamVersion) {
        lastStreamVersion = currentStreamVersion
        // Close old bitmap before clearing
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
        frameRaters.faceDetection.reset()
        frameRaters.gestureDetection.reset()
        frameRaters.rendering.reset()
      }

      // Update FPS from frameRater (uses smoothed rendering FPS)
      const currentFps = Math.round(frameRaters.rendering.getFPS())
      if (currentFps !== state.get().fps) {
        state.mutate((s) => {
          s.fps = currentFps
          s.frameCount += 1
        })
      }

      // Precompute should-run flags for this update tick
      // When paused, freeze data updates
      // Note: backdrop is handled in render loop, not update loop
      const shouldRun: LoopShouldRun = {
        backdrop: false, // Backdrop is handled in render loop
        videoStreamUpdate:
          !isPaused && frameRaters.videoStreamUpdate.shouldExecute(deltaMs),
        faceDetection:
          !isPaused && frameRaters.faceDetection.shouldExecute(deltaMs),
        gestureDetection:
          !isPaused && frameRaters.gestureDetection.shouldExecute(deltaMs),
      }

      const executed: Partial<Record<LoopFrameRaterKey, boolean>> = {}

      // Run detection (throttled, only when not paused)
      let faceResult: FaceLandmarkerResult | null = cachedFrameData.faceResult
      let gestureResult: GestureRecognizerResult | null =
        cachedFrameData.gestureResult

      if (!isPaused && hasVideoFrame) {
        if (shouldRun.faceDetection) {
          try {
            faceResult = faceLandmarker.detectForVideo(video, timestamp)
            executed.faceDetection = true
          } catch {
            // Face detection failed, continue
          }
        }

        if (shouldRun.gestureDetection) {
          try {
            gestureResult = gestureRecognizer.recognizeForVideo(
              video,
              timestamp,
            )
            executed.gestureDetection = true
          } catch {
            // Gesture recognition failed, continue
          }
        }

        // Update cached video frame at its own rate
        if (shouldRun.videoStreamUpdate) {
          // Calculate viewport for caching
          const cacheViewport = calculateViewport(
            video.videoWidth,
            video.videoHeight,
            canvas.width,
            canvas.height,
          )

          // Ensure offscreen canvas is sized correctly
          if (
            offscreenCanvas.width !== canvas.width ||
            offscreenCanvas.height !== canvas.height
          ) {
            offscreenCanvas.width = canvas.width
            offscreenCanvas.height = canvas.height
          }

          // Cache the video frame using reusable offscreen canvas
          offscreenCtx.clearRect(
            0,
            0,
            offscreenCanvas.width,
            offscreenCanvas.height,
          )

          // Draw video to offscreen canvas within viewport with mirroring if needed
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

          // Cache using createImageBitmap - much faster than getImageData!
          // No CPU-GPU sync required, stays GPU-resident
          try {
            // Close previous bitmap to free memory
            if (cachedFrameData.videoFrame) {
              cachedFrameData.videoFrame.close()
            }

            // Create ImageBitmap from the offscreen canvas
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

        // Update cached detection results (only when not paused)
        cachedFrameData.faceResult = faceResult
        cachedFrameData.gestureResult = gestureResult
      }

      if (!hasVideoFrame) {
        // Avoid MediaPipe processing when video is not ready
        faceResult = null
        gestureResult = null
      }

      // Emit frame data for external subscribers when detection ran
      if (
        !isPaused &&
        (shouldRun.faceDetection || shouldRun.gestureDetection)
      ) {
        frame$.notify({
          timestamp,
          video,
          faceResult,
          gestureResult,
        })
      }

      // Record executions after updates complete
      if (executed.videoStreamUpdate) {
        frameRaters.videoStreamUpdate.recordExecution()
      }
      if (executed.faceDetection) {
        frameRaters.faceDetection.recordExecution()
      }
      if (executed.gestureDetection) {
        frameRaters.gestureDetection.recordExecution()
      }
    }

    const update = () => {
      updateAsync().catch((error) => {
        console.error('Update error:', error)
      })
    }

    // Render loop - runs on RAF for smooth visuals
    const render = () => {
      if (!state.get().running) return

      const timestamp = performance.now()
      const deltaMs = timestamp - lastRenderTimestamp
      lastRenderTimestamp = timestamp

      const video = camera.video
      const isPaused = state.get().paused

      // Clear canvas
      canvas.clear()

      // Calculate viewport that respects video aspect ratio
      const viewport = calculateViewport(
        video.videoWidth,
        video.videoHeight,
        canvas.width,
        canvas.height,
      )

      // Resize offscreen canvas if needed
      if (
        offscreenCanvas.width !== canvas.width ||
        offscreenCanvas.height !== canvas.height
      ) {
        offscreenCanvas.width = canvas.width
        offscreenCanvas.height = canvas.height
      }

      // Precompute should-run flags for render tasks
      const shouldRunBackdrop = frameRaters.backdrop.shouldExecute(deltaMs)

      // Track which render tasks executed
      const renderExecuted: Partial<Record<LoopFrameRaterKey, boolean>> = {}

      // Build render context with latest cached data
      // Note: Landmarks don't need rescaling! They're normalized (0-1) relative to video
      // and the render tasks transform them using the CURRENT viewport
      const renderContext: RenderContext = {
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
          faceDetection: false,
          gestureDetection: false,
        },
        recordExecution: (key: LoopFrameRaterKey) => {
          renderExecuted[key] = true
        },
        offscreenCtx,
      }

      // Execute all render tasks
      for (const task of renderTasks) {
        try {
          task(renderContext)
        } catch (error) {
          console.error('Render task error:', error)
        }
      }

      // Record executions for throttled render tasks
      if (renderExecuted.backdrop) {
        frameRaters.backdrop.recordExecution()
      }

      // Record rendering frame (always happens)
      frameRaters.rendering.recordFrame(deltaMs)

    //   rafId = requestAnimationFrame(render)
    }

    const tick = () => {
      update()
      render()
      rafId = requestAnimationFrame(tick)
    }

    const api: LoopAPI = {
      state,
      frame$,

      start: () => {
        if (state.get().running) return
        state.update((s) => {
          return {
            ...s,
            running: true,
          }
        })
        lastRenderTimestamp = performance.now()
        lastUpdateTimestamp = performance.now()

        // Start update loop at ~30 FPS (33ms interval)
        // updateIntervalId = window.setInterval(update, 33)

        // Start render loop on RAF
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
        // if (updateIntervalId !== null) {
        //   clearInterval(updateIntervalId)
        //   updateIntervalId = null
        // }
        // Clean up ImageBitmap to free GPU memory
        if (cachedFrameData.videoFrame) {
          cachedFrameData.videoFrame.close()
          cachedFrameData.videoFrame = null
        }
      },

      pause: () => {
        state.update((s) => {
          return {
            ...s,
            paused: true,
          }
        })
      },

      resume: () => {
        state.update((s) => {
          return {
            ...s,
            paused: false,
          }
        })
        // Reset timestamps on resume
        lastRenderTimestamp = performance.now()
        lastUpdateTimestamp = performance.now()
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
        renderTasks.add(task)
        return () => renderTasks.delete(task)
      },
    }

    return api
  },
  halt: (loop) => {
    loop.stop()
    loop.frame$.clear()
  },
})

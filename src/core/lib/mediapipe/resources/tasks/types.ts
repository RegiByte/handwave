import type {
  FaceLandmarkerResult,
  GestureRecognizerResult,
} from '@mediapipe/tasks-vision'
import type { CanvasAPI } from '@/core/lib/mediapipe/resources/canvas'
import type { FrameRaterAPI } from '@/core/lib/mediapipe/resources/frameRater'

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
  viewport: {
    x: number
    y: number
    width: number
    height: number
  }
  cachedViewport: {
    x: number
    y: number
    width: number
    height: number
  } | null
  frameRaters: {
    rendering: ReturnType<FrameRaterAPI['variable']>
    videoStreamUpdate: ReturnType<FrameRaterAPI['throttled']>
    framePush: ReturnType<FrameRaterAPI['throttled']>
    backdrop: ReturnType<FrameRaterAPI['throttled']>
  }
  shouldRun: {
    backdrop: boolean
    videoStreamUpdate: boolean
  }
  shouldRender: {
    videoForeground: boolean
  }
  recordExecution: (key: 'backdrop' | 'videoStreamUpdate') => void
  offscreenCtx: CanvasRenderingContext2D
}

export type RenderTask = (context: RenderContext) => void

import type {
  FaceLandmarkerResult,
  GestureRecognizerResult,
} from '@mediapipe/tasks-vision'
import type { CanvasAPI } from '../canvas'
import type { FrameRaterAPI } from '../frameRater'

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
    faceDetection: ReturnType<FrameRaterAPI['throttled']>
    gestureDetection: ReturnType<FrameRaterAPI['throttled']>
  }
  shouldRun: {
    backdrop: boolean
    videoStreamUpdate: boolean
    faceDetection: boolean
    gestureDetection: boolean
  }
  recordExecution: (
    key:
      | 'backdrop'
      | 'videoStreamUpdate'
      | 'faceDetection'
      | 'gestureDetection',
  ) => void
  offscreenCtx: CanvasRenderingContext2D
}

export type RenderTask = (context: RenderContext) => void

import type { EnrichedDetectionFrame } from '@handwave/intent-engine'
import type { CanvasAPI } from '../detection/canvas'
import type { FrameRaterAPI } from '../detection/frameRater'
import { TaskDefinition } from '@handwave/system'

export type RenderContext = {
  ctx: CanvasRenderingContext2D
  drawer: CanvasAPI['drawer']
  width: number
  height: number
  video: HTMLVideoElement
  detectionFrame: EnrichedDetectionFrame | null
  timestamp: number
  deltaMs: number
  mirrored: boolean
  paused: boolean
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
  offscreenCanvas: HTMLCanvasElement
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

/**
 * Render task can be either:
 * - A simple function that receives RenderContext
 * - A lifecycle task with init/execute/cleanup
 */
export type RenderTask = TaskDefinition<RenderContext, any>
import type { RenderTask } from './types'

/**
 * Render task: Draw the video frame as foreground
 * Respects the mirrored state for selfie mode and viewport aspect ratio
 * When paused, redraws the cached frozen frame at current viewport position
 * Uses ImageBitmap for GPU-resident cached frames (much faster!)
 */
export const videoForegroundTask: RenderTask = ({
  ctx,
  video,
  mirrored,
  paused,
  cachedVideoFrame,
  viewport,
  cachedViewport,
  shouldRender,
}) => {
  // When paused with cached frame (ImageBitmap)
  if (paused && cachedVideoFrame && cachedViewport) {
    if (!shouldRender.videoForeground) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
      ctx.fillRect(viewport.x, viewport.y, viewport.width, viewport.height)
      return
    }
    // ImageBitmap can be drawn directly with drawImage - GPU-to-GPU!
    ctx.drawImage(
      cachedVideoFrame,
      0, // Source X
      0, // Source Y
      cachedVideoFrame.width, // Source width
      cachedVideoFrame.height, // Source height
      viewport.x, // Dest X (current viewport position)
      viewport.y, // Dest Y
      viewport.width, // Dest width (scaled to current viewport)
      viewport.height, // Dest height (scaled to current viewport)
    )
    return
  }

  // When not paused, draw the live video within viewport with mirroring if needed
  if (!paused && shouldRender.videoForeground) {
    if (mirrored) {
      ctx.save()
      ctx.translate(viewport.x + viewport.width, viewport.y)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, viewport.width, viewport.height)
      ctx.restore()
    } else {
      ctx.drawImage(
        video,
        viewport.x,
        viewport.y,
        viewport.width,
        viewport.height,
      )
    }
  }

  if (!shouldRender.videoForeground) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
    ctx.fillRect(viewport.x, viewport.y, viewport.width, viewport.height)
    return
  }
}

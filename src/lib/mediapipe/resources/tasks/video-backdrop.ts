import type { RenderTask } from './types'

/**
 * Render task: Draw a blurred, scaled backdrop of the video
 * Fills the entire canvas to avoid black bars
 *
 * OPTIMIZATION: The expensive blur filter is only computed at a throttled rate,
 * but the cached result is rendered every frame to avoid flicker.
 */
export const createVideoBackdropTask = (): RenderTask => {
  // Cached backdrop - computed at low FPS, rendered every frame
  let cachedBackdrop: ImageBitmap | null = null
  let pendingBackdrop: Promise<ImageBitmap> | null = null
  let cachedWidth = 0
  let cachedHeight = 0
  let cachedMirrored: boolean | null = null

  // Offscreen canvas for computing the blurred backdrop
  const offscreenCanvas = document.createElement('canvas')
  const offscreenCtx = offscreenCanvas.getContext('2d')

  return ({
    ctx,
    video,
    width,
    height,
    mirrored,
    shouldRun,
    paused,
    recordExecution,
  }) => {
    // Check if we need to recompute the backdrop
    const sizeChanged = width !== cachedWidth || height !== cachedHeight
    const mirrorChanged = mirrored !== cachedMirrored
    const shouldRecompute =
      (shouldRun.backdrop || sizeChanged || mirrorChanged) &&
      !pendingBackdrop &&
      !paused

    // Recompute the blurred backdrop at throttled rate (or when size/mirror changes)
    if (shouldRecompute && offscreenCtx) {
      recordExecution('backdrop')

      // Resize offscreen canvas if needed
      if (sizeChanged) {
        offscreenCanvas.width = width
        offscreenCanvas.height = height
        cachedWidth = width
        cachedHeight = height
      }
      cachedMirrored = mirrored

      // Draw blurred video to offscreen canvas
      offscreenCtx.filter = 'blur(40px) brightness(0.6)'

      if (mirrored) {
        offscreenCtx.save()
        offscreenCtx.translate(width, 0)
        offscreenCtx.scale(-1, 1)
        offscreenCtx.drawImage(video, 0, 0, width, height)
        offscreenCtx.restore()
      } else {
        offscreenCtx.drawImage(video, 0, 0, width, height)
      }

      offscreenCtx.filter = 'none'

      // Create new bitmap asynchronously
      pendingBackdrop = createImageBitmap(offscreenCanvas)
      pendingBackdrop
        .then((bitmap) => {
          // Swap the old bitmap with the new one
          const oldBackdrop = cachedBackdrop
          cachedBackdrop = bitmap
          pendingBackdrop = null

          // Close the old bitmap AFTER we've swapped
          if (oldBackdrop) {
            oldBackdrop.close()
          }
        })
        .catch(() => {
          // Ignore errors - we'll try again next time
          pendingBackdrop = null
        })
    }

    // Always render the cached backdrop (fast - just a drawImage)
    if (cachedBackdrop) {
      try {
        ctx.drawImage(cachedBackdrop, 0, 0, width, height)
      } catch {
        // Bitmap was detached, clear it and wait for next one
        cachedBackdrop = null
      }
    } else if (offscreenCanvas.width > 0 && offscreenCanvas.height > 0) {
      // Fallback: draw from offscreen canvas if bitmap not ready yet
      ctx.drawImage(offscreenCanvas, 0, 0, width, height)
    }
  }
}

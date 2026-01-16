import type { RenderTask } from './types'

/**
 * Render task: Golden overlay when smiling
 */
export const smileOverlayTask: RenderTask = ({
  ctx,
  faceResult,
  width,
  height,
}) => {
  if (!faceResult?.faceBlendshapes?.length) return

  const blendshapes = faceResult.faceBlendshapes[0]?.categories ?? []
  const smileLeft =
    blendshapes.find((b) => b.categoryName === 'mouthSmileLeft')?.score ?? 0
  const smileRight =
    blendshapes.find((b) => b.categoryName === 'mouthSmileRight')?.score ?? 0
  const smile = (smileLeft + smileRight) / 2

  if (smile > 0.4) {
    ctx.fillStyle = `rgba(244, 63, 94, ${smile * 0.3})`
    ctx.fillRect(0, 0, width, height)
  }
}


import { mapLandmarkToViewport } from '@handwave/mediapipe'
import type { RenderTask } from '../types'

/**
 * Render task: Show face landmark indices (only key landmarks to avoid clutter)
 * Displays indices for important facial features
 * Renders every frame
 */
export const faceLandmarkLabelsTask: RenderTask = ({
  ctx,
  faceResult,
  mirrored,
  viewport,
}) => {
  if (!faceResult?.faceLandmarks?.length) return

  // Key landmark indices to display (to avoid clutter with all 468)
  const keyLandmarks = [
    { idx: 1, name: 'NOSE_TIP' },
    { idx: 33, name: 'R_EYE_OUTER' },
    { idx: 133, name: 'R_EYE_INNER' },
    { idx: 263, name: 'L_EYE_OUTER' },
    { idx: 362, name: 'L_EYE_INNER' },
    { idx: 61, name: 'MOUTH_R' },
    { idx: 291, name: 'MOUTH_L' },
    { idx: 0, name: 'MOUTH_CENTER' },
    { idx: 10, name: 'FOREHEAD' },
    { idx: 152, name: 'CHIN' },
  ]

  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 3

  faceResult.faceLandmarks.forEach((landmarks) => {
    keyLandmarks.forEach(({ idx, name }) => {
      const landmark = landmarks[idx]
      if (!landmark) return

      // Map landmark to viewport coordinates
      const pos = mapLandmarkToViewport(landmark, viewport, mirrored)

      ctx.fillStyle = '#00FFFF'
      ctx.fillText(`${idx}`, pos.x, pos.y - 8)

      ctx.font = '8px monospace'
      ctx.fillStyle = 'rgba(0,255,255,0.6)'
      ctx.fillText(name, pos.x, pos.y + 10)
      ctx.font = '10px monospace'
    })
  })

  ctx.shadowBlur = 0
  ctx.textAlign = 'start'
}


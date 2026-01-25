import { mapLandmarkToViewport } from '@handwave/mediapipe'
import type { RenderTask } from '../types'

/**
 * Render task: Show hand landmark indices and labels
 * Displays small labels on each landmark with its index
 * Renders every frame
 */
export const handLandmarkLabelsTask: RenderTask = ({
  ctx,
  gestureResult,
  mirrored,
  viewport,
}) => {
  if (!gestureResult?.landmarks?.length) return

  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 3

  // Hand landmark names (21 landmarks per hand)
  const landmarkNames = [
    'WRIST',
    'THUMB_0',
    'THUMB_1',
    'THUMB_2',
    'THUMB_3',
    'INDEX_0',
    'INDEX_1',
    'INDEX_2',
    'INDEX_3',
    'MIDDLE_0',
    'MIDDLE_1',
    'MIDDLE_2',
    'MIDDLE_3',
    'RING_0',
    'RING_1',
    'RING_2',
    'RING_3',
    'PINKY_0',
    'PINKY_1',
    'PINKY_2',
    'PINKY_3',
  ]

  gestureResult.landmarks.forEach((landmarks) => {
    landmarks.forEach((landmark, i) => {
      // Map landmark to viewport coordinates
      const pos = mapLandmarkToViewport(landmark, viewport, mirrored)

      // Color code by finger
      let color = '#fff'
      if (i === 0)
        color = '#FF6B6B' // Wrist
      else if (i >= 1 && i <= 4)
        color = '#FFD93D' // Thumb
      else if (i >= 5 && i <= 8)
        color = '#6BCF7F' // Index
      else if (i >= 9 && i <= 12)
        color = '#4D96FF' // Middle
      else if (i >= 13 && i <= 16)
        color = '#A78BFA' // Ring
      else if (i >= 17 && i <= 20) color = '#FB7185' // Pinky

      ctx.fillStyle = color

      // Draw landmark index
      ctx.fillText(`${i}`, pos.x, pos.y - 8)

      // Draw landmark name (smaller, below)
      ctx.font = '8px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(landmarkNames[i] || '', pos.x, pos.y + 10)
      ctx.font = '10px monospace'
    })
  })

  ctx.shadowBlur = 0
  ctx.textAlign = 'start'
}

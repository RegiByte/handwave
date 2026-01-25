import { mapLandmarkToViewport } from '@handwave/mediapipe'
import type { RenderTask } from '@handwave/mediapipe'

/**
 * Hand Landmark Labels Configuration
 */
export type HandLandmarkLabelsConfig = {
  fontSize?: number
  showNames?: boolean
  colorScheme?: 'default' | 'monochrome'
}

// Hand landmark names (21 landmarks per hand)
const LANDMARK_NAMES = [
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

/**
 * Create Hand Landmark Labels Render Task
 * 
 * Displays small labels on each landmark with its index and optional name.
 * Renders every frame.
 */
export const createHandLandmarkLabelsTask = (
  config?: HandLandmarkLabelsConfig
): RenderTask => {
  const fontSize = config?.fontSize ?? 10
  const showNames = config?.showNames ?? true
  const colorScheme = config?.colorScheme ?? 'default'

  return ({ ctx, detectionFrame, mirrored, viewport }) => {
    const hands = detectionFrame?.detectors?.hand
    if (!hands || hands.length === 0) return

    ctx.font = `${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 3

    hands.forEach((hand) => {
      hand.landmarks.forEach((landmark, i) => {
        const pos = mapLandmarkToViewport(landmark, viewport, mirrored)

        // Color code by finger
        let color = '#fff'
        if (colorScheme === 'default') {
          if (i === 0) color = '#FF6B6B' // Wrist
          else if (i >= 1 && i <= 4) color = '#FFD93D' // Thumb
          else if (i >= 5 && i <= 8) color = '#6BCF7F' // Index
          else if (i >= 9 && i <= 12) color = '#4D96FF' // Middle
          else if (i >= 13 && i <= 16) color = '#A78BFA' // Ring
          else if (i >= 17 && i <= 20) color = '#FB7185' // Pinky
        }

        ctx.fillStyle = color

        // Draw landmark index
        ctx.fillText(`${i}`, pos.x, pos.y - 8)

        // Draw landmark name if enabled
        if (showNames) {
          ctx.font = `${Math.floor(fontSize * 0.8)}px monospace`
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.fillText(LANDMARK_NAMES[i] || '', pos.x, pos.y + 10)
          ctx.font = `${fontSize}px monospace`
        }
      })
    })

    ctx.shadowBlur = 0
    ctx.textAlign = 'start'
  }
}

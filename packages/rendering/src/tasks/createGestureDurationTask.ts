import type { Detection, GestureRecognizerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { FrameSnapshot, Vector3 } from '@handwave/intent-engine'
import type { RenderTask } from '@handwave/mediapipe'
import { mapLandmarkToViewport } from '@handwave/mediapipe'

/**
 * Frame History API interface (minimal required interface)
 * This allows the task to work with any frame history implementation
 */
export type FrameHistoryAPI = {
  getContinuousDuration: (
    predicate: (frame: FrameSnapshot) => boolean
  ) => number
}

/**
 * Gesture Duration Configuration
 */
export type GestureDurationConfig = {
  fontSize?: number
  showBackground?: boolean
  colorByHandedness?: boolean
}

/**
 * Calculate center of mass from hand landmarks
 */
function calculateCenterOfMass(
  landmarks: Array<NormalizedLandmark>
): Vector3 {
  const sum = landmarks.reduce(
    (acc, lm) => ({
      x: acc.x + lm.x,
      y: acc.y + lm.y,
      z: acc.z + (lm.z ?? 0),
    }),
    { x: 0, y: 0, z: 0 }
  )

  return {
    x: sum.x / landmarks.length,
    y: sum.y / landmarks.length,
    z: sum.z / landmarks.length,
  }
}

/**
 * Get gesture name for a specific hand
 */
function getGestureForHand(
  handIndex: number,
  gestureResult: GestureRecognizerResult
): { name: string; score: number } | null {
  if (!gestureResult?.gestures?.[handIndex]) return null

  const gesture = gestureResult.gestures[handIndex] as unknown as Detection
  const category = gesture?.categories?.[0]

  if (!category) return null

  return {
    name: category.categoryName || 'None',
    score: category.score || 0,
  }
}

/**
 * Get handedness for a specific hand
 */
function getHandedness(gestureResult: GestureRecognizerResult, handIndex: number): string {
  if (!gestureResult?.handedness?.[handIndex]) return 'Unknown'

  const handedness = gestureResult.handedness[handIndex] as unknown as Detection
  const category = handedness?.categories?.[0]

  return category?.categoryName || 'Unknown'
}

/**
 * Check if a frame has a specific gesture for a specific hand
 */
function hasGesture(
  frame: FrameSnapshot,
  targetHandIndex: number,
  gestureName: string
): boolean {
  if (!frame.gestureResult?.hands) return false
  
  // Find the hand by its handIndex property (not array index)
  const hand = frame.gestureResult.hands.find(h => h.handIndex === targetHandIndex)
  if (!hand) return false

  return hand.gesture === gestureName
}

/**
 * Create Gesture Duration Render Task
 *
 * Shows gesture name and held duration at the center of mass of each hand.
 * Duration is calculated from frame history using continuous duration queries.
 *
 * Philosophy: Temporal context makes interactions meaningful.
 */
export const createGestureDurationTask = (
  frameHistory: FrameHistoryAPI,
  config?: GestureDurationConfig
): RenderTask => {
  const fontSize = config?.fontSize ?? 20
  const showBackground = config?.showBackground ?? true
  const colorByHandedness = config?.colorByHandedness ?? true

  return ({ ctx, gestureResult, viewport, mirrored }) => {
    if (!gestureResult?.landmarks?.length) return

    gestureResult.landmarks.forEach((landmarks, handIndex) => {
      // Calculate center of mass (average of all 21 landmarks)
      const center = calculateCenterOfMass(landmarks)

      // Get gesture info for this hand
      const gesture = getGestureForHand(handIndex, gestureResult)
      if (!gesture || gesture.name === 'None') return

      // Get continuous duration from frame history
      const duration = frameHistory.getContinuousDuration((frame) => {
        return hasGesture(frame, handIndex, gesture.name)
      })

      // Transform center to viewport coordinates
      const mapped = mapLandmarkToViewport(
        { x: center.x, y: center.y, z: center.z },
        viewport,
        mirrored
      )

      // Color by handedness if enabled
      let color = '#ffffff'
      if (colorByHandedness) {
        const handedness = getHandedness(gestureResult, handIndex)
        color = handedness === 'Right' ? '#00ffff' : '#ff00ff'
      }

      // Draw label with duration
      const durationSec = (duration / 1000).toFixed(1)
      const label = `${gesture.name} (${durationSec}s)`

      // Set up text styling
      ctx.font = `bold ${fontSize}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      if (showBackground) {
        // Draw background rectangle for better contrast
        const textMetrics = ctx.measureText(label)
        const padding = 8
        const bgWidth = textMetrics.width + padding * 2
        const bgHeight = fontSize + 8

        // Draw semi-transparent black background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(
          mapped.x - bgWidth / 2,
          mapped.y - bgHeight / 2,
          bgWidth,
          bgHeight
        )

        // Draw border around background
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.strokeRect(
          mapped.x - bgWidth / 2,
          mapped.y - bgHeight / 2,
          bgWidth,
          bgHeight
        )
      }

      // Draw text with strong shadow for extra contrast
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 2

      ctx.fillStyle = color
      ctx.fillText(label, mapped.x, mapped.y)

      // Reset shadow
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    })

    // Reset text alignment
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
}

/**
 * Gesture Labels Component
 *
 * HTML overlay that shows detected gesture names for each hand.
 * Labels follow hand center of mass and are color-coded by handedness.
 *
 * Split into two parts:
 * - GestureLabelTracker: Inside Canvas, tracks positions using R3F hooks
 * - GestureLabelsOverlay: Outside Canvas, renders HTML labels
 */

import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import type { EnrichedDetectionFrame } from '@handwave/intent-engine'
import { normalizedToWorld, projectToScreen } from '@/lib/coordinates'
import type { ViewportConfig } from '@/lib/coordinates'

export interface HandLabel {
  handIndex: number
  handedness: string
  gesture: string
  screenX: number
  screenY: number
}

interface GestureLabelTrackerProps {
  detectionFrameRef: RefObject<EnrichedDetectionFrame | null>
  mirrored?: boolean
  videoElement: HTMLVideoElement | null
  onLabelsUpdate: (labels: Array<HandLabel>) => void
}

interface GestureLabelsOverlayProps {
  labels: Array<HandLabel>
}

/**
 * Calculate center of mass from hand landmarks
 */
function calculateCenterOfMass(
  landmarks: Array<{ x: number; y: number; z: number }>
): { x: number; y: number; z: number } {
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
 * Tracker component - runs inside Canvas to use R3F hooks
 */
export function GestureLabelTracker({
  detectionFrameRef,
  mirrored = true,
  videoElement,
  onLabelsUpdate,
}: GestureLabelTrackerProps) {
  const { size, camera } = useThree()

  useFrame(() => {
    const detectionFrame = detectionFrameRef.current
    const hands = detectionFrame?.detectors?.hand || []

    if (hands.length === 0) {
      onLabelsUpdate([])
      return
    }

    // Get current viewport config
    const viewport: ViewportConfig = {
      width: size.width,
      height: size.height,
      videoWidth: videoElement?.videoWidth || 1280,
      videoHeight: videoElement?.videoHeight || 720,
    }

    // Calculate label positions for each hand
    const newLabels: Array<HandLabel> = hands
      .filter((hand) => hand.gesture && hand.gesture !== 'None')
      .map((hand) => {
        // Calculate center of mass (average of 21 landmarks)
        const center = calculateCenterOfMass(hand.landmarks)

        // Transform to world space
        const worldPos = normalizedToWorld(center, viewport, camera, mirrored, 10)

        // Project to screen space
        const screenPos = projectToScreen(worldPos, camera, viewport)

        return {
          handIndex: hand.handIndex,
          handedness: hand.handedness,
          gesture: hand.gesture,
          screenX: screenPos.x,
          screenY: screenPos.y,
        }
      })

    onLabelsUpdate(newLabels)
  })

  return null
}

/**
 * Overlay component - renders HTML labels outside Canvas
 */
export function GestureLabelsOverlay({ labels }: GestureLabelsOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {labels.map((label) => {
        const color = label.handedness === 'right' ? '#00ffff' : '#ff00ff'
        
        return (
          <div
            key={label.handIndex}
            style={{
              position: 'absolute',
              left: label.screenX,
              top: label.screenY,
              transform: 'translate(-50%, -50%)',
              color,
              fontFamily: 'monospace',
              fontSize: '16px',
              fontWeight: 'bold',
              textShadow: '0 0 4px rgba(0,0,0,0.8), 2px 2px 4px rgba(0,0,0,0.6)',
              whiteSpace: 'nowrap',
              padding: '4px 8px',
              background: 'rgba(0, 0, 0, 0.7)',
              borderRadius: '4px',
              border: `2px solid ${color}`,
            }}
          >
            {label.gesture}
          </div>
        )
      })}
    </div>
  )
}

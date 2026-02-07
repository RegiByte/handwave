/**
 * Box Action Labels Component
 *
 * HTML overlay that shows contextual action labels on top of 3D boxes.
 * Labels indicate available interactions based on proximity and state.
 *
 * Split into two parts:
 * - BoxActionLabelTracker: Inside Canvas, tracks box positions and calculates states
 * - BoxActionLabelsOverlay: Outside Canvas, renders HTML labels
 */

import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import type { EnrichedDetectionFrame } from '@handwave/intent-engine'
import type { Vector3 } from 'three'
import { getPinchCenter, projectToScreen } from '@/lib/coordinates'
import type { ViewportConfig } from '@/lib/coordinates'

export interface BoxActionLabel {
  boxId: string
  screenX: number
  screenY: number
  state: 'available' | 'grabbed' | 'resize-available' | 'resizing'
  color: string
  distance: number
}

interface BoxInfo {
  id: string
  position: Vector3
  color: string
  scale: number
}

interface BoxActionLabelTrackerProps {
  boxes: Array<BoxInfo>
  grabbedBoxes: Map<string, { boxId: string; handIndex: number; handedness: string; offset: Vector3 }>
  resizedBoxes: Map<string, { boxId: string; handIndex1: number; handIndex2: number; baselineDistance: number; originalScale: number }>
  detectionFrameRef: RefObject<EnrichedDetectionFrame | null>
  videoElement: HTMLVideoElement | null
  mirrored?: boolean
  onLabelsUpdate: (labels: Array<BoxActionLabel>) => void
}

interface BoxActionLabelsOverlayProps {
  labels: Array<BoxActionLabel>
}

const LABEL_THRESHOLD = 1.2 // Show label when hand is within this distance
const LABEL_Y_OFFSET = 1.2 // Position label above box (in world units)

/**
 * Tracker component - runs inside Canvas to use R3F hooks
 */
export function BoxActionLabelTracker({
  boxes,
  grabbedBoxes,
  resizedBoxes,
  detectionFrameRef,
  videoElement,
  mirrored = true,
  onLabelsUpdate,
}: BoxActionLabelTrackerProps) {
  const { size, camera } = useThree()

  useFrame(() => {
    const detectionFrame = detectionFrameRef.current
    const hands = detectionFrame?.detectors?.hand || []

    if (hands.length === 0 && grabbedBoxes.size === 0) {
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

    const newLabels: Array<BoxActionLabel> = []

    // Build set of occupied hand indices (hands currently grabbing or resizing boxes)
    const occupiedHandIndices = new Set<number>()
    Array.from(grabbedBoxes.values()).forEach((grabbed) => {
      occupiedHandIndices.add(grabbed.handIndex)
    })
    Array.from(resizedBoxes.values()).forEach((resized) => {
      occupiedHandIndices.add(resized.handIndex1)
      occupiedHandIndices.add(resized.handIndex2)
    })

    // For each box, determine if it should show a label (priority order)
    boxes.forEach((box) => {
      // Calculate box radius and scaled label offset
      const boxRadius = 0.5 * box.scale // Box is 1x1x1, so radius = 0.5 * scale
      const scaledLabelOffset = LABEL_Y_OFFSET * box.scale // Scale label offset with box

      // Priority 1: Check if box is being resized
      const isResizing = Array.from(resizedBoxes.values()).some(
        (resized) => resized.boxId === box.id
      )

      if (isResizing) {
        // Show "Scaling..." label
        const labelPosition = box.position.clone()
        labelPosition.y += scaledLabelOffset

        const screenPos = projectToScreen(labelPosition, camera, viewport)

        newLabels.push({
          boxId: box.id,
          screenX: screenPos.x,
          screenY: screenPos.y,
          state: 'resizing',
          color: box.color,
          distance: 0,
        })
        return
      }

      // Priority 2: Check if box is grabbed
      const isGrabbed = Array.from(grabbedBoxes.values()).some(
        (grabbed) => grabbed.boxId === box.id
      )

      if (isGrabbed) {
        // Show "Release to Drop" label
        const labelPosition = box.position.clone()
        labelPosition.y += scaledLabelOffset

        const screenPos = projectToScreen(labelPosition, camera, viewport)

        newLabels.push({
          boxId: box.id,
          screenX: screenPos.x,
          screenY: screenPos.y,
          state: 'grabbed',
          color: box.color,
          distance: 0,
        })
        return
      }

      // Priority 3: Check if BOTH hands are near (resize available)
      const freeHands = hands.filter(
        (hand) => !occupiedHandIndices.has(hand.handIndex) && 
                  hand.landmarks && 
                  hand.landmarks.length === 21
      )

      if (freeHands.length >= 2) {
        // Check if both hands are within threshold (accounting for box surface)
        const distances = freeHands.map((hand) => {
          const pinchCenter = getPinchCenter(hand, viewport, camera, mirrored, 10)
          const distanceToCenter = pinchCenter.distanceTo(box.position)
          // Calculate distance to box surface
          return Math.max(0, distanceToCenter - boxRadius)
        })

        const bothHandsNear = distances.filter(d => d < LABEL_THRESHOLD).length >= 2

        if (bothHandsNear) {
          // Show "Grab to Scale" label
          const labelPosition = box.position.clone()
          labelPosition.y += scaledLabelOffset

          const screenPos = projectToScreen(labelPosition, camera, viewport)

          newLabels.push({
            boxId: box.id,
            screenX: screenPos.x,
            screenY: screenPos.y,
            state: 'resize-available',
            color: box.color,
            distance: Math.min(...distances),
          })
          return
        }
      }

      // Priority 4: Check proximity to single FREE hand (grab available)
      let nearestDistance = Infinity

      hands.forEach((hand) => {
        // Skip hands that are currently grabbing or resizing
        if (occupiedHandIndices.has(hand.handIndex)) {
          return
        }

        if (hand.landmarks && hand.landmarks.length === 21) {
          const pinchCenter = getPinchCenter(hand, viewport, camera, mirrored, 10)
          const distanceToCenter = pinchCenter.distanceTo(box.position)
          // Calculate distance to box surface
          const distanceToSurface = Math.max(0, distanceToCenter - boxRadius)

          if (distanceToSurface < nearestDistance) {
            nearestDistance = distanceToSurface
          }
        }
      })

      // Show "Pinch to Grab" label if hand is near
      if (nearestDistance < LABEL_THRESHOLD) {
        const labelPosition = box.position.clone()
        labelPosition.y += scaledLabelOffset

        const screenPos = projectToScreen(labelPosition, camera, viewport)

        newLabels.push({
          boxId: box.id,
          screenX: screenPos.x,
          screenY: screenPos.y,
          state: 'available',
          color: box.color,
          distance: nearestDistance,
        })
      }
    })

    onLabelsUpdate(newLabels)
  })

  return null
}

/**
 * Overlay component - renders HTML labels outside Canvas
 */
export function BoxActionLabelsOverlay({ labels }: BoxActionLabelsOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 11, // Above gesture labels (z-index: 10)
      }}
    >
      {labels.map((label) => {
        const text = 
          label.state === 'available' ? 'Pinch to Grab' :
          label.state === 'grabbed' ? 'Release to Drop' :
          label.state === 'resize-available' ? 'Grab to Scale' :
          label.state === 'resizing' ? 'Scaling...' :
          ''
        
        return (
          <div
            key={label.boxId}
            style={{
              position: 'absolute',
              left: label.screenX,
              top: label.screenY,
              transform: 'translate(-50%, -50%)',
              color: '#ffffff',
              fontFamily: 'monospace',
              fontSize: '14px',
              fontWeight: 'bold',
              textShadow: '0 0 4px rgba(0,0,0,0.8), 2px 2px 4px rgba(0,0,0,0.6)',
              whiteSpace: 'nowrap',
              padding: '6px 12px',
              background: 'rgba(0, 0, 0, 0.8)',
              borderRadius: '6px',
              border: `2px solid ${label.color}`,
              transition: 'opacity 0.2s ease-in-out',
              opacity: 0.9,
            }}
          >
            {text}
          </div>
        )
      })}
    </div>
  )
}

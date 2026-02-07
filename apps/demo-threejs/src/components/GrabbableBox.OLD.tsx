/**
 * Grabbable Box Component (OLD - ARCHIVED)
 *
 * DEPRECATED: This component has been replaced by the World resource architecture.
 * Kept for reference during migration.
 *
 * A 3D box that can be grabbed and dragged with pinch gestures.
 * Highlights when hand is nearby, follows pinch center when grabbed.
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Mesh, Vector3 } from 'three'
import type { EnrichedDetectionFrame } from '@handwave/intent-engine'
import { getPinchCenter } from '@/lib/coordinates'
import type { ViewportConfig } from '@/lib/coordinates'

interface GrabbableBoxProps {
  id: string
  position: [number, number, number]
  color: string
  detectionFrameRef: RefObject<EnrichedDetectionFrame | null>
  videoElement: HTMLVideoElement | null
  mirrored?: boolean
  grabbedState?: {
    handIndex: number
    handedness: string
    offset: Vector3
  } | null
  resizeState?: {
    handIndex1: number
    handIndex2: number
    baselineDistance: number
    originalScale: number
  } | null
  occupiedHandIndices?: Set<number>
  boxScalesRef?: RefObject<Map<string, number>>
  onProximityChange?: (isNear: boolean, nearestHandIndex: number | null) => void
  onPositionUpdate?: (id: string, position: Vector3) => void
}

const PROXIMITY_THRESHOLD = 1.0 // Distance threshold for highlighting
const MIN_SCALE = 0.5
const MAX_SCALE = 2.5
const SCALE_DAMPING = 0.5

export function GrabbableBox({
  id,
  position,
  color,
  detectionFrameRef,
  videoElement,
  mirrored = true,
  grabbedState = null,
  resizeState = null,
  occupiedHandIndices = new Set(),
  boxScalesRef,
  onProximityChange,
  onPositionUpdate,
}: GrabbableBoxProps) {
  const meshRef = useRef<Mesh>(null)
  const { size, camera } = useThree()
  const [isNear, setIsNear] = useState(false)
  const resizePositionRef = useRef<Vector3 | null>(null)

  useFrame(() => {
    if (!meshRef.current) return

    const detectionFrame = detectionFrameRef.current
    const hands = detectionFrame?.detectors?.hand || []

    // Get current viewport config
    const viewport: ViewportConfig = {
      width: size.width,
      height: size.height,
      videoWidth: videoElement?.videoWidth || 1280,
      videoHeight: videoElement?.videoHeight || 720,
    }

    // If being resized, calculate scale based on hand distance
    if (resizeState) {
      // Capture position when resize starts (first frame of resize)
      if (!resizePositionRef.current) {
        resizePositionRef.current = meshRef.current.position.clone()
      }

      const hand1 = hands.find((h) => h.handIndex === resizeState.handIndex1)
      const hand2 = hands.find((h) => h.handIndex === resizeState.handIndex2)

      if (
        hand1 && hand1.landmarks && hand1.landmarks.length === 21 &&
        hand2 && hand2.landmarks && hand2.landmarks.length === 21
      ) {
        const pinchCenter1 = getPinchCenter(hand1, viewport, camera, mirrored, 10)
        const pinchCenter2 = getPinchCenter(hand2, viewport, camera, mirrored, 10)

        // Calculate current distance between hands
        const currentDistance = pinchCenter1.distanceTo(pinchCenter2)

        // Calculate scale factor with damping
        const rawScaleFactor = currentDistance / resizeState.baselineDistance
        const scaleFactor = 1 + (rawScaleFactor - 1) * SCALE_DAMPING

        // Apply scale with limits
        const newScale = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, resizeState.originalScale * scaleFactor)
        )

        meshRef.current.scale.setScalar(newScale)

        // Lock position during resize - ensure box doesn't move
        meshRef.current.position.copy(resizePositionRef.current)

        // Update scale in ref
        if (boxScalesRef?.current) {
          boxScalesRef.current.set(id, newScale)
        }
      }
      return
    }

    // Clear resize position ref when not resizing
    if (resizePositionRef.current) {
      resizePositionRef.current = null
    }

    // If grabbed, follow the pinch center with offset
    if (grabbedState) {
      const hand = hands.find((h) => h.handIndex === grabbedState.handIndex)
      if (hand && hand.landmarks && hand.landmarks.length === 21) {
        const pinchCenter = getPinchCenter(hand, viewport, camera, mirrored, 10)
        meshRef.current.position.copy(pinchCenter).add(grabbedState.offset)
        
        // Notify parent of position update
        if (onPositionUpdate) {
          onPositionUpdate(id, meshRef.current.position.clone())
        }
      }
      return
    }

    // Check proximity to all FREE hands (not currently grabbing another box)
    let nearestDistance = Infinity
    let nearestHandIndex: number | null = null

    // Get current box scale and calculate radius
    const currentScale = meshRef.current.scale.x // Uniform scale
    const boxRadius = 0.5 * currentScale // Box is 1x1x1, so radius = 0.5 * scale

    hands.forEach((hand) => {
      // Skip hands that are currently grabbing another box
      if (occupiedHandIndices.has(hand.handIndex)) {
        return
      }

      if (hand.landmarks && hand.landmarks.length === 21) {
        const pinchCenter = getPinchCenter(hand, viewport, camera, mirrored, 10)
        const distanceToCenter = pinchCenter.distanceTo(meshRef.current!.position)
        
        // Calculate distance to box surface (distance to center minus box radius)
        const distanceToSurface = Math.max(0, distanceToCenter - boxRadius)

        if (distanceToSurface < nearestDistance) {
          nearestDistance = distanceToSurface
          nearestHandIndex = hand.handIndex
        }
      }
    })

    // Update proximity state
    const wasNear = isNear
    const nowNear = nearestDistance < PROXIMITY_THRESHOLD

    if (wasNear !== nowNear) {
      setIsNear(nowNear)
      if (onProximityChange) {
        onProximityChange(nowNear, nowNear ? nearestHandIndex : null)
      }
    }

    // Rotate the box for visual interest (when not grabbed or resizing)
    if (!resizeState) {
      meshRef.current.rotation.x += 0.01
      meshRef.current.rotation.y += 0.005
    }
  })

  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        color={color}
        emissive={isNear && !grabbedState && !resizeState ? 'white' : color}
        emissiveIntensity={isNear && !grabbedState && !resizeState ? 0.8 : 0}
        metalness={isNear && !grabbedState && !resizeState ? 0.3 : 0.1}
        roughness={isNear && !grabbedState && !resizeState ? 0.4 : 0.7}
      />
    </mesh>
  )
}

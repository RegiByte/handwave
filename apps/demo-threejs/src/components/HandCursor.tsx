/**
 * Hand Cursor Component
 *
 * Visualizes hand positions in 3D space.
 * Maps 2D hand tracking coordinates to 3D world space with proper projection.
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { RefObject } from 'react';
import type { Mesh } from 'three'
import type { EnrichedDetectionFrame, Handedness } from '@handwave/intent-engine'
import { remap } from '@handwave/rendering'
import { getVideoDisplayScale, normalizedToWorld } from '@/lib/coordinates'
import type { ViewportConfig } from '@/lib/coordinates';

interface HandCursorProps {
  detectionFrameRef: RefObject<EnrichedDetectionFrame | null>
  mirrored?: boolean
  videoElement?: HTMLVideoElement | null
  onDebugUpdate?: (handIndex: number, debugInfo: {
    handedness: string
    z: number
    depthScale: number
    sphereScale: number
    visible: boolean
  }) => void
}

export function HandCursors({ detectionFrameRef, mirrored = true, videoElement, onDebugUpdate }: HandCursorProps) {
  // Read hands from ref in useFrame to avoid re-renders
  const handsRef = useRef<Array<{ landmarks: Array<any>; handedness: Handedness }>>([])
  const { camera } = useThree()

  useFrame(() => {
    const detectionFrame = detectionFrameRef.current
    handsRef.current = detectionFrame?.detectors?.hand || []
  })

  // We can't dynamically create/destroy meshes in useFrame, so we'll render a fixed number
  // and hide the ones we don't need
  const MAX_HANDS = 2

  return (
    <>
      {Array.from({ length: MAX_HANDS }).map((_, index) => (
        <HandCursor
          key={index}
          handsRef={handsRef}
          handIndex={index}
          mirrored={mirrored}
          videoElement={videoElement || null}
          camera={camera}
          onDebugUpdate={onDebugUpdate}
        />
      ))}
    </>
  )
}

interface SingleHandCursorProps {
  handsRef: RefObject<Array<{ landmarks: Array<any>; handedness: Handedness }>>
  handIndex: number
  mirrored: boolean
  videoElement: HTMLVideoElement | null
  camera: any
  onDebugUpdate?: (handIndex: number, debugInfo: {
    handedness: string
    z: number
    depthScale: number
    sphereScale: number
    visible: boolean
  }) => void
}

function HandCursor({ handsRef, handIndex, mirrored, videoElement, camera, onDebugUpdate }: SingleHandCursorProps) {
  const meshRef = useRef<Mesh>(null)
  const { size } = useThree()

  // Update position in useFrame (no React re-renders!)
  useFrame((state) => {
    if (!meshRef.current) return

    const hands = handsRef.current
    const hand = hands[handIndex]

    if (hand && hand.landmarks && hand.landmarks[8]) {
      // Use index finger tip (landmark 8) as cursor position
      const indexTip = hand.landmarks[8]

      // Get current viewport config (updates on resize!)
      const viewport: ViewportConfig = {
        width: size.width,
        height: size.height,
        videoWidth: videoElement?.videoWidth || 1280,
        videoHeight: videoElement?.videoHeight || 720,
      }

      // Transform using proper projection
      const worldPos = normalizedToWorld(
        { x: indexTip.x, y: indexTip.y, z: indexTip.z || 0 },
        viewport,
        camera,
        mirrored,
        10 // plane distance (matches camera z position)
      )

      // Update position
      meshRef.current.position.set(worldPos.x, worldPos.y, worldPos.z)

      // Show mesh
      meshRef.current.visible = true

      // Scale based on video display area + depth + gentle pulsing animation
      const displayScale = getVideoDisplayScale(viewport)

      // MediaPipe z: ALWAYS negative in our setup
      // Actual measured range: -0.19 (very close) to -0.01 (very far)
      // More negative = closer, less negative = farther
      // We want: closer = bigger, farther = smaller
      const z = indexTip.z || 0

      // Remap z from actual MediaPipe range to scale range
      // -0.20 (very close) → 1.8x (much bigger)
      // -0.10 (normal)     → 1.0x (normal size)
      // -0.01 (very far)   → 0.5x (much smaller)
      const depthScale = remap(z, -0.20, -0.01, 2, 0.3, true)

      const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.1 + 1
      const finalScale = displayScale * depthScale * pulse
      meshRef.current.scale.setScalar(finalScale)

      // Emit debug info
      if (onDebugUpdate) {
        onDebugUpdate(handIndex, {
          handedness: hand.handedness,
          z,
          depthScale,
          sphereScale: finalScale,
          visible: true,
        })
      }

      // Color based on handedness
      const color = hand.handedness === 'left' ? '#00FF88' : '#FF6B9D'
        ; (meshRef.current.material as any).color.set(color)
        ; (meshRef.current.material as any).emissive.set(color)
    } else {
      // Hide mesh if no hand detected
      meshRef.current.visible = false

      // Emit debug info (hidden)
      if (onDebugUpdate) {
        onDebugUpdate(handIndex, {
          handedness: 'none',
          z: 0,
          depthScale: 0,
          sphereScale: 0,
          visible: false,
        })
      }
    }
  })

  return (
    <mesh ref={meshRef} visible={false}>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshStandardMaterial
        color="#00FF88"
        emissive="#00FF88"
        emissiveIntensity={0.5}
        transparent
        opacity={0.8}
      />
    </mesh>
  )
}

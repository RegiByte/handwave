/**
 * Hand Skeleton Component
 *
 * Visualizes hand skeleton in 3D space with landmarks and connections.
 * Shows depth-based coloring similar to 2D demo.
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { RefObject } from 'react';
import type { Group } from 'three';
import { CatmullRomCurve3, Color, Mesh, MeshBasicMaterial, TubeGeometry, Vector3 } from 'three'
import type { EnrichedDetectionFrame, Handedness } from '@handwave/intent-engine'
import { normalizedToWorld } from '@/lib/coordinates'
import type { ViewportConfig } from '@/lib/coordinates';

interface HandSkeletonProps {
  detectionFrameRef: RefObject<EnrichedDetectionFrame | null>
  mirrored?: boolean
  visible?: boolean
  videoElement?: HTMLVideoElement | null
}

/**
 * Hand skeleton connections (21-point hand model)
 * Hand landmarks: 0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
 */
const HAND_SKELETON_CONNECTIONS: Array<[number, number]> = [
  // Palm base
  [0, 1], // Wrist to thumb base
  [0, 5], // Wrist to index base
  [0, 9], // Wrist to middle base
  [0, 13], // Wrist to ring base
  [0, 17], // Wrist to pinky base
  [5, 9], // Index to middle base
  [9, 13], // Middle to ring base
  [13, 17], // Ring to pinky base
  // Thumb
  [1, 2],
  [2, 3],
  [3, 4],
  // Index finger
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle finger
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring finger
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky finger
  [17, 18],
  [18, 19],
  [19, 20],
]

/**
 * Create color from depth value
 * Blue (far) → Red (near)
 */
function getDepthColor(z: number): [number, number, number] {
  // Normalize z to [0, 1] range (assuming z is in [-1, 1])
  const normalized = (z + 1) / 2

  // Interpolate between blue (far) and red (near)
  const r = normalized
  const g = 0.2
  const b = 1 - normalized

  return [r, g, b]
}

// Fixed number of hand skeletons
const MAX_HANDS = 2

export function HandSkeletons({ detectionFrameRef, mirrored = true, visible = true, videoElement }: HandSkeletonProps) {
  // Read hands from ref in useFrame to avoid re-renders
  const handsRef = useRef<EnrichedDetectionFrame['detectors']['hand']>([])
  const { camera } = useThree()

  useFrame(() => {
    const detectionFrame = detectionFrameRef.current
    handsRef.current = detectionFrame?.detectors?.hand || []
  })


  if (!visible) return null

  return (
    <>
      {Array.from({ length: MAX_HANDS }).map((_, index) => (
        <HandSkeleton
          key={index}
          handsRef={handsRef}
          handIndex={index}
          mirrored={mirrored}
          videoElement={videoElement || null}
          camera={camera}
        />
      ))}
    </>
  )
}

interface SingleHandSkeletonProps {
  handsRef: RefObject<EnrichedDetectionFrame['detectors']['hand']>
  handIndex: number
  mirrored: boolean
  videoElement: HTMLVideoElement | null
  camera: any
}

const connectionMaterial = new MeshBasicMaterial({
  color: new Color(0.25, 0.5, 1.0), // Blue default
  transparent: true,
  opacity: 0.9,
})

function HandSkeleton({ handsRef, handIndex, mirrored, videoElement, camera }: SingleHandSkeletonProps) {
  const groupRef = useRef<Group>(null)
  const { size } = useThree()

  // Create tube meshes for each connection (thick, visible lines)
  const connectionMeshes = useMemo(() => {
    return HAND_SKELETON_CONNECTIONS.map(() => {
      const mesh = {
        mesh: null as Mesh | null,
        material: connectionMaterial,
      }
      return mesh
    })
  }, [])

  // Update tube positions in useFrame
  useFrame(() => {
    if (!groupRef.current || !handsRef.current) return

    const hands = handsRef.current
    const hand = hands[handIndex]

    if (hand && hand.landmarks && hand.landmarks.length === 21) {
      const landmarks = hand.landmarks

      // Get current viewport config (updates on resize!)
      const viewport: ViewportConfig = {
        width: size.width,
        height: size.height,
        videoWidth: videoElement?.videoWidth || 1280,
        videoHeight: videoElement?.videoHeight || 720,
      }

      // Transform landmarks to world space using proper projection
      const worldLandmarks = landmarks.map((lm) => {
        const worldPos = normalizedToWorld(
          { x: lm.x, y: lm.y, z: lm.z || 0 },
          viewport,
          camera,
          mirrored,
          10 // plane distance (matches camera z position)
        )
        return new Vector3(worldPos.x, worldPos.y, worldPos.z)
      })

      // Update each connection
      HAND_SKELETON_CONNECTIONS.forEach(([start, end], idx) => {
        const startPos = worldLandmarks[start]
        const endPos = worldLandmarks[end]

        // Create curve between two points
        const curve = new CatmullRomCurve3([startPos, endPos])

        // Create tube geometry (thick line)
        const tubeGeometry = new TubeGeometry(curve, 2, 0.03, 8, false)

        // Update or create mesh
        if (connectionMeshes[idx].mesh && groupRef.current) {
          // Update existing mesh
          connectionMeshes[idx].mesh.geometry.dispose()
          connectionMeshes[idx].mesh.geometry = tubeGeometry
        } else if (groupRef.current) {
          // Create new mesh
          const mesh = new Mesh(tubeGeometry, connectionMeshes[idx].material)
          connectionMeshes[idx].mesh = mesh
          groupRef.current.add(mesh)
        }

        // Update color based on depth
        const avgZ = (startPos.z + endPos.z) / 2
        const [r, g, b] = getDepthColor(avgZ)
        connectionMeshes[idx].material.color.setRGB(r, g, b)
      })

      // Show skeleton
      groupRef.current.visible = true
    } else {
      // Hide skeleton if no hand detected
      groupRef.current.visible = false
    }
  })

  return <group ref={groupRef} visible={false} />
}

/**
 * MainView Component (World Resource Architecture)
 *
 * Clean separation: World owns simulation, React only renders.
 * All interaction logic lives in the World resource.
 */

import type { EnrichedDetectionFrame } from '@handwave/intent-engine'
import { useAtomState } from '@handwave/system'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ChangeEvent, RefObject } from 'react'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { HandCursors } from './HandCursor'
import { HandSkeletons } from './HandSkeleton'
import { FPSDisplay } from './FPSDisplay'
import { DebugOverlay } from './DebugOverlay'
import { GestureLabelTracker, GestureLabelsOverlay } from './GestureLabels'
import type { HandLabel } from './GestureLabels'
import { useMediapipeResource } from '@/system/system'
import type { ViewportConfig } from '@/lib/coordinates'
import type { BoxEntity } from '@/system/resources/worldResource'

export function MainView() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0a0a',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Suspense fallback={<LoadingScreen />}>
          <MediaPipeIntegration />
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#111',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '3px solid #333',
          borderTopColor: '#00FF88',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      <p style={{ color: '#888', fontFamily: 'monospace', margin: 0 }}>
        Loading Experience...
      </p>
      <p style={{ color: '#888', fontFamily: 'monospace', margin: 0 }}>
        Please give access to your camera when prompted.
      </p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function ErrorFallback({ error }: { error: unknown }) {
  const errorMessage =
    error instanceof Error ? error.message : 'An unknown error occurred'
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#1a0a0a',
        border: '1px solid #f00',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
      }}
    >
      <p style={{ color: '#f66', fontFamily: 'system-ui', margin: 0 }}>
        Failed to initialize System
      </p>
      <p
        style={{
          color: '#888',
          fontFamily: 'monospace',
          margin: 0,
          fontSize: 12,
          textAlign: 'center',
        }}
      >
        {errorMessage}
      </p>
    </div>
  )
}

function MediaPipeIntegration() {
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)

  // Get resources from the system (suspends until ready)
  const runtime = useMediapipeResource('runtime')
  const canvas = useMediapipeResource('canvas')
  const loop = useMediapipeResource('loop')
  const cameraResource = useMediapipeResource('camera')
  const world = useMediapipeResource('world')

  // Subscribe to runtime state for display
  const runtimeState = useAtomState(runtime.state)
  const cameraState = useAtomState(cameraResource.state)

  // Debug state
  const [debugHands, setDebugHands] = useState<Array<{
    handIndex: number
    handedness: string
    z: number
    depthScale: number
    sphereScale: number
    visible: boolean
  }>>([])

  const handleDebugUpdate = useCallback((handIndex: number, debugInfo: {
    handedness: string
    z: number
    depthScale: number
    sphereScale: number
    visible: boolean
  }) => {
    setDebugHands((prev) => {
      const newHands = [...prev]
      newHands[handIndex] = { handIndex, ...debugInfo }
      return newHands.filter(h => h.visible)
    })
  }, [])

  // Gesture labels state
  const [gestureLabels, setGestureLabels] = useState<Array<HandLabel>>([])

  const handleLabelsUpdate = useCallback((labels: Array<HandLabel>) => {
    setGestureLabels(labels)
  }, [])

  // Initialize world with boxes on mount
  useEffect(() => {
    world.createBox('box-1', [-2, 0, 0], 'orange')
    world.createBox('box-2', [2, 0, 0], 'hotpink')

    return () => {
      // Cleanup handled by world resource halt
    }
  }, [world])

  // Mount video element into container using the camera hook
  cameraResource.useVideoContainer(videoContainerRef, { mirrored: runtimeState.mirrored })

  // Get reference to video element after mount
  useEffect(() => {
    if (videoContainerRef.current) {
      const videoEl = videoContainerRef.current.querySelector('video')
      if (videoEl) {
        videoElementRef.current = videoEl
      }
    }
  }, [videoContainerRef])

  // Resize canvas to match video resolution
  useEffect(() => {
    const videoWidth = cameraState.videoWidth || 1280
    const videoHeight = cameraState.videoHeight || 720
    canvas.resize(videoWidth, videoHeight)
  }, [canvas, cameraState.videoWidth, cameraState.videoHeight])

  // Use a ref to store detection frame without triggering re-renders
  const detectionFrameRef = useRef<EnrichedDetectionFrame | null>(null)

  useEffect(() => {
    const unsubscribe = loop.frame$.subscribe((frameData) => {
      detectionFrameRef.current = frameData.enrichedDetectionFrame
    })

    return () => {
      unsubscribe()
    }
  }, [loop])


  // Start the system on mount
  useEffect(() => {
    runtime.commands.start()

    return () => {
      runtime.commands.stop()
    }
  }, [runtime])

  const handleVideoDeviceChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const deviceId = event.target.value
    runtime.commands.setVideoDevice(deviceId)
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        overflow: 'hidden',
      }}
    >
      {/* FPS Display */}
      <FPSDisplay loop={loop} />

      {/* Debug Overlay */}
      <DebugOverlay hands={debugHands} />

      {/* Video background container */}
      <div
        ref={videoContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
        }}
      />

      {/* Three.js scene overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 10], fov: 50 }}
          gl={{ alpha: true, }}
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          <ambientLight intensity={Math.PI / 2} />
          <spotLight
            position={[10, 10, 10]}
            angle={0.15}
            penumbra={1}
            decay={0}
            intensity={Math.PI}
          />
          <pointLight
            position={[-10, -10, -10]}
            decay={0}
            intensity={Math.PI}
          />

          {/* World update loop - single useFrame for all world updates */}
          <WorldUpdater 
            world={world} 
            videoElement={videoElementRef.current}
            mirrored={runtimeState.mirrored}
          />

          {/* World entities - render externally-owned meshes */}
          <WorldEntities world={world} />

          {/* Gesture label tracker (inside Canvas) */}
          <GestureLabelTracker
            detectionFrameRef={detectionFrameRef}
            mirrored={runtimeState.mirrored}
            videoElement={videoElementRef.current}
            onLabelsUpdate={handleLabelsUpdate}
          />

          {/* Hand skeleton */}
          <HandSkeletons
            detectionFrameRef={detectionFrameRef}
            mirrored={runtimeState.mirrored}
            visible={runtimeState.handSkeletonVisible}
            videoElement={videoElementRef.current}
          />

          {/* Hand cursors */}
          <HandCursors
            detectionFrameRef={detectionFrameRef}
            mirrored={runtimeState.mirrored}
            videoElement={videoElementRef.current}
            onDebugUpdate={handleDebugUpdate}
          />
        </Canvas>
      </div>

      {/* Gesture Labels Overlay (outside Canvas) */}
      <GestureLabelsOverlay labels={gestureLabels} />

      {/* Controls overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(0, 0, 0, 0.9)',
          minHeight: 64,
          paddingLeft: 16,
          paddingRight: 16,
          width: '100%',
          zIndex: 2,
        }}
      >
        <span
          style={{
            color: '#888',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          {runtimeState.running
            ? runtimeState.paused
              ? '⏸ Paused'
              : '● Live'
            : '○ Stopped'}
        </span>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => runtime.commands.togglePause()}
            style={{
              background: runtimeState.paused
                ? 'rgba(255, 107, 107, 0.2)'
                : 'rgba(0, 255, 136, 0.2)',
              border: runtimeState.paused
                ? '1px solid #FF6B6B'
                : '1px solid #00FF88',
              borderRadius: 4,
              padding: '4px 12px',
              color: runtimeState.paused ? '#FF6B6B' : '#00FF88',
              fontFamily: 'monospace',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {runtimeState.paused ? '▶️ Resume' : '⏸ Pause'}
          </button>

          <button
            onClick={() => runtime.commands.toggleMirror()}
            style={{
              background: runtimeState.mirrored
                ? 'rgba(0, 255, 136, 0.2)'
                : 'rgba(255, 255, 255, 0.1)',
              border: runtimeState.mirrored
                ? '1px solid #00FF88'
                : '1px solid #444',
              borderRadius: 4,
              padding: '4px 12px',
              color: runtimeState.mirrored ? '#00FF88' : '#888',
              fontFamily: 'monospace',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {runtimeState.mirrored ? '🪞 Mirror ON' : '🪞 Mirror OFF'}
          </button>
        </div>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#888',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Video
            <select
              value={runtimeState.selectedVideoDeviceId}
              onChange={handleVideoDeviceChange}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid #333',
                borderRadius: 4,
                color: '#ddd',
                padding: '4px 8px',
                fontFamily: 'monospace',
                fontSize: 12,
                maxWidth: 220,
              }}
            >
              <option value="">Default</option>
              {runtimeState.videoDevices.map((device: MediaDeviceInfo) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </label>

          {/* Status info */}
          <span style={{ color: '#888' }}>
            Video: {cameraState.videoWidth}x{cameraState.videoHeight}
          </span>
        </div>
      </div>
    </div>
  )
}

// World updater - single useFrame loop for all world updates
// Also configures world with Three.js camera and viewport
function WorldUpdater({ 
  world, 
  videoElement,
  mirrored 
}: { 
  world: ReturnType<typeof useMediapipeResource<'world'>>
  videoElement: HTMLVideoElement | null
  mirrored: boolean
}) {
  const { camera, size } = useThree()
  
  // Configure world with Three.js context (runs once per render)
  useEffect(() => {
    if (videoElement) {
      const viewport: ViewportConfig = {
        width: size.width,
        height: size.height,
        videoWidth: videoElement.videoWidth || 1280,
        videoHeight: videoElement.videoHeight || 720,
      }
      
      world.setViewport(viewport)
      world.setCamera(camera)
      world.setMirrored(mirrored)
    }
  }, [world, camera, size.width, size.height, videoElement, mirrored])
  
  // Update loop
  useFrame((_, delta) => {
    world.update(delta)
  })
  
  return null
}

// World entities renderer - renders externally-owned meshes with <primitive />
function WorldEntities({ world }: { world: ReturnType<typeof useMediapipeResource<'world'>> }) {
  const [entities, setEntities] = useState<Array<BoxEntity>>([])

  // Subscribe to world state changes
  useEffect(() => {
    // Initial render
    const boxes = world.getEntitiesByType('box')
    setEntities(boxes)

    // TODO: Add subscription mechanism if world state needs reactive updates
    // For now, entities are created once and their meshes are updated in-place

  }, [world])

  return (
    <>
      {entities.map((entity) => (
        <primitive key={entity.id} object={entity.mesh} />
      ))}
    </>
  )
}

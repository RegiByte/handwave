/**
 * MainView Component (OLD - ARCHIVED)
 * 
 * DEPRECATED: This version has been replaced with World resource architecture.
 * Kept for reference during migration.
 * 
 * Original implementation with React-managed state and component-local logic.
 */

import type { EnrichedDetectionFrame } from '@handwave/intent-engine'
import { useAtomState } from '@handwave/system'
import { Canvas, useThree } from '@react-three/fiber'
import type { ChangeEvent, RefObject } from 'react'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Vector3 } from 'three'
import { HandCursors } from './HandCursor'
import { HandSkeletons } from './HandSkeleton'
import { FPSDisplay } from './FPSDisplay'
import { DebugOverlay } from './DebugOverlay'
import { GestureLabelTracker, GestureLabelsOverlay } from './GestureLabels'
import type { HandLabel } from './GestureLabels'
import { BoxActionLabelTracker, BoxActionLabelsOverlay } from './BoxActionLabels'
import type { BoxActionLabel } from './BoxActionLabels'
import { GrabbableBox } from './GrabbableBox.OLD'
import { useMediapipeResource } from '@/system/system'
import { getPinchCenter } from '@/lib/coordinates'
import type { ViewportConfig } from '@/lib/coordinates'
import { grabIntent, resizeIntent } from '@/intents/core'

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
  const canvas = useMediapipeResource('canvas') // Still needed by loop, just not rendered
  const loop = useMediapipeResource('loop')
  const cameraResource = useMediapipeResource('camera')
  const intentEngine = useMediapipeResource('intentEngine')
  
  // Ref to store Three.js camera
  const threeCameraRef = useRef<any>(null)

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

  // Grab state management
  const [grabbedBoxes, setGrabbedBoxes] = useState<Map<string, {
    boxId: string
    handIndex: number
    handedness: string
    offset: Vector3
  }>>(new Map())

  // Resize state management
  const [resizedBoxes, setResizedBoxes] = useState<Map<string, {
    boxId: string
    handIndex1: number
    handIndex2: number
    baselineDistance: number
    originalScale: number
  }>>(new Map())

  // Box refs to find nearest box
  const boxPositionsRef = useRef<Map<string, Vector3>>(new Map([
    ['box-1', new Vector3(-2, 0, 0)],
    ['box-2', new Vector3(2, 0, 0)],
  ]))

  // Box scales ref to track current scales
  const boxScalesRef = useRef<Map<string, number>>(new Map([
    ['box-1', 1.0],
    ['box-2', 1.0],
  ]))

  // Callback to update box positions
  const handleBoxPositionUpdate = useCallback((boxId: string, position: Vector3) => {
    boxPositionsRef.current.set(boxId, position.clone())
  }, [])

  // Gesture labels state
  const [gestureLabels, setGestureLabels] = useState<Array<HandLabel>>([])
  
  const handleLabelsUpdate = useCallback((labels: Array<HandLabel>) => {
    setGestureLabels(labels)
  }, [])

  // Box action labels state
  const [boxActionLabels, setBoxActionLabels] = useState<Array<BoxActionLabel>>([])
  
  const handleBoxLabelsUpdate = useCallback((labels: Array<BoxActionLabel>) => {
    setBoxActionLabels(labels)
  }, [])

  // Subscribe to grab intent events
  useEffect(() => {
    const unsubscribeStart = intentEngine.subscribe(
      grabIntent.events.start,
      (event) => {
        // Find nearest box to this hand's pinch center
        const detectionFrame = detectionFrameRef.current
        if (!detectionFrame || !threeCameraRef.current) return

        const hand = detectionFrame.detectors.hand?.find(
          (h) => h.handIndex === event.handIndex
        )
        if (!hand || !hand.landmarks || hand.landmarks.length < 21) return

        // Get viewport config
        const viewport: ViewportConfig = {
          width: window.innerWidth,
          height: window.innerHeight,
          videoWidth: videoElementRef.current?.videoWidth || 1280,
          videoHeight: videoElementRef.current?.videoHeight || 720,
        }

        // Calculate pinch center
        const pinchCenter = getPinchCenter(
          hand,
          viewport,
          threeCameraRef.current,
          runtimeState.mirrored,
          10
        )

        // Find nearest box (accounting for box scale/surface)
        let nearestBoxId: string | null = null
        let nearestDistance = Infinity

        boxPositionsRef.current.forEach((boxPos, boxId) => {
          const distanceToCenter = pinchCenter.distanceTo(boxPos)
          const boxScale = boxScalesRef.current.get(boxId) || 1.0
          const boxRadius = 0.5 * boxScale
          // Calculate distance to box surface
          const distanceToSurface = Math.max(0, distanceToCenter - boxRadius)
          
          if (distanceToSurface < nearestDistance && distanceToSurface < 1.5) {
            nearestDistance = distanceToSurface
            nearestBoxId = boxId
          }
        })

        if (nearestBoxId) {
          // Calculate offset from pinch center to box center
          const boxPos = boxPositionsRef.current.get(nearestBoxId)!
          const offset = boxPos.clone().sub(pinchCenter)

          setGrabbedBoxes((prev) => {
            const newMap = new Map(prev)
            newMap.set(nearestBoxId!, {
              boxId: nearestBoxId!,
              handIndex: event.handIndex,
              handedness: event.hand,
              offset,
            })
            return newMap
          })
        }
      }
    )

    const unsubscribeEnd = intentEngine.subscribe(
      grabIntent.events.end,
      (event) => {
        // Release any box grabbed by this hand
        setGrabbedBoxes((prev) => {
          const newMap = new Map(prev)
          // Find and remove the box grabbed by this hand
          for (const [boxId, grabState] of newMap.entries()) {
            if (grabState.handIndex === event.handIndex) {
              // Update box position before releasing
              const detectionFrame = detectionFrameRef.current
              if (detectionFrame) {
                const hand = detectionFrame.detectors.hand?.find(
                  (h) => h.handIndex === event.handIndex
                )
                if (hand && hand.landmarks && hand.landmarks.length === 21) {
                  const viewport: ViewportConfig = {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    videoWidth: videoElementRef.current?.videoWidth || 1280,
                    videoHeight: videoElementRef.current?.videoHeight || 720,
                  }
                  const pinchCenter = getPinchCenter(
                    hand,
                    viewport,
                    threeCameraRef.current,
                    runtimeState.mirrored,
                    10
                  )
                  const finalPos = pinchCenter.clone().add(grabState.offset)
                  boxPositionsRef.current.set(boxId, finalPos)
                }
              }
              newMap.delete(boxId)
            }
          }
          return newMap
        })
      }
    )

    return () => {
      unsubscribeStart()
      unsubscribeEnd()
    }
  }, [intentEngine, runtimeState.mirrored])

  // Subscribe to resize intent events
  useEffect(() => {
    const unsubscribeStart = intentEngine.subscribe(
      resizeIntent.events.start,
      (event) => {
        // Find box within range of both hands
        const detectionFrame = detectionFrameRef.current
        if (!detectionFrame || !threeCameraRef.current) return

        const hands = detectionFrame.detectors.hand || []
        if (hands.length < 2) return

        // Get viewport config
        const viewport: ViewportConfig = {
          width: window.innerWidth,
          height: window.innerHeight,
          videoWidth: videoElementRef.current?.videoWidth || 1280,
          videoHeight: videoElementRef.current?.videoHeight || 720,
        }

        // Find the two hands involved (from event metadata)
        // For bidirectional intents, we need both hand indices
        // The event should have both hands in its context
        const hand1 = hands.find((h) => h.handIndex === event.handIndex)
        const hand2 = hands.find((h) => h.handIndex !== event.handIndex)

        if (!hand1 || !hand2) return
        if (!hand1.landmarks || hand1.landmarks.length < 21) return
        if (!hand2.landmarks || hand2.landmarks.length < 21) return

        // Calculate pinch centers for both hands
        const pinchCenter1 = getPinchCenter(
          hand1,
          viewport,
          threeCameraRef.current,
          runtimeState.mirrored,
          10
        )
        const pinchCenter2 = getPinchCenter(
          hand2,
          viewport,
          threeCameraRef.current,
          runtimeState.mirrored,
          10
        )

        // Calculate center point between both hands
        const centerPoint = new Vector3()
          .addVectors(pinchCenter1, pinchCenter2)
          .multiplyScalar(0.5)

        // Find nearest box to center point (accounting for box scale/surface)
        let nearestBoxId: string | null = null
        let nearestDistance = Infinity

        boxPositionsRef.current.forEach((boxPos, boxId) => {
          const distanceToCenter = centerPoint.distanceTo(boxPos)
          const boxScale = boxScalesRef.current.get(boxId) || 1.0
          const boxRadius = 0.5 * boxScale
          // Calculate distance to box surface
          const distanceToSurface = Math.max(0, distanceToCenter - boxRadius)
          
          if (distanceToSurface < nearestDistance && distanceToSurface < 1.5) {
            nearestDistance = distanceToSurface
            nearestBoxId = boxId
          }
        })

        if (nearestBoxId) {
          // Calculate baseline distance between hands
          const baselineDistance = pinchCenter1.distanceTo(pinchCenter2)
          const originalScale = boxScalesRef.current.get(nearestBoxId) || 1.0

          setResizedBoxes((prev) => {
            const newMap = new Map(prev)
            newMap.set(nearestBoxId!, {
              boxId: nearestBoxId!,
              handIndex1: hand1.handIndex,
              handIndex2: hand2.handIndex,
              baselineDistance,
              originalScale,
            })
            return newMap
          })
        }
      }
    )

    const unsubscribeEnd = intentEngine.subscribe(
      resizeIntent.events.end,
      (event) => {
        // Finalize resize and clear state
        setResizedBoxes((prev) => {
          const newMap = new Map(prev)
          // Find and remove the box being resized
          for (const [boxId, resizeState] of newMap.entries()) {
            if (
              resizeState.handIndex1 === event.handIndex ||
              resizeState.handIndex2 === event.handIndex
            ) {
              // Scale is already updated in boxScalesRef by GrabbableBox
              newMap.delete(boxId)
            }
          }
          return newMap
        })
      }
    )

    return () => {
      unsubscribeStart()
      unsubscribeEnd()
    }
  }, [intentEngine, runtimeState.mirrored])

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

  // Resize canvas to match video resolution (even though we don't render to it)
  // The loop still uses it for frame processing
  useEffect(() => {
    const videoWidth = cameraState.videoWidth || 1280
    const videoHeight = cameraState.videoHeight || 720
    canvas.resize(videoWidth, videoHeight)
  }, [canvas, cameraState.videoWidth, cameraState.videoHeight])

  // Use a ref to store detection frame without triggering re-renders
  const detectionFrameRef = useRef<EnrichedDetectionFrame | null>(null)

  useEffect(() => {
    const unsubscribe = loop.frame$.subscribe((frameData) => {
      // Update ref directly - no React re-render!
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
          gl={{ alpha: true,  }}
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

          {/* Capture Three.js camera */}
          <CameraCapture cameraRef={threeCameraRef} />

          {/* Gesture label tracker (inside Canvas) */}
          <GestureLabelTracker
            detectionFrameRef={detectionFrameRef}
            mirrored={runtimeState.mirrored}
            videoElement={videoElementRef.current}
            onLabelsUpdate={handleLabelsUpdate}
          />

          {/* Box action label tracker (inside Canvas) */}
          <BoxActionLabelTracker
            boxes={[
              { 
                id: 'box-1', 
                position: boxPositionsRef.current.get('box-1')!, 
                color: 'orange',
                scale: boxScalesRef.current.get('box-1') || 1.0
              },
              { 
                id: 'box-2', 
                position: boxPositionsRef.current.get('box-2')!, 
                color: 'hotpink',
                scale: boxScalesRef.current.get('box-2') || 1.0
              },
            ]}
            grabbedBoxes={grabbedBoxes}
            resizedBoxes={resizedBoxes}
            detectionFrameRef={detectionFrameRef}
            videoElement={videoElementRef.current}
            mirrored={runtimeState.mirrored}
            onLabelsUpdate={handleBoxLabelsUpdate}
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

          {/* Grabbable boxes */}
          <GrabbableBox
            id="box-1"
            position={[-2, 0, 0]}
            color="orange"
            detectionFrameRef={detectionFrameRef}
            videoElement={videoElementRef.current}
            mirrored={runtimeState.mirrored}
            grabbedState={grabbedBoxes.get('box-1') || null}
            resizeState={resizedBoxes.get('box-1') || null}
            occupiedHandIndices={new Set([
              ...Array.from(grabbedBoxes.values()).map(g => g.handIndex),
              ...Array.from(resizedBoxes.values()).flatMap(r => [r.handIndex1, r.handIndex2])
            ])}
            boxScalesRef={boxScalesRef}
            onPositionUpdate={handleBoxPositionUpdate}
          />
          <GrabbableBox
            id="box-2"
            position={[2, 0, 0]}
            color="hotpink"
            detectionFrameRef={detectionFrameRef}
            videoElement={videoElementRef.current}
            mirrored={runtimeState.mirrored}
            grabbedState={grabbedBoxes.get('box-2') || null}
            resizeState={resizedBoxes.get('box-2') || null}
            occupiedHandIndices={new Set([
              ...Array.from(grabbedBoxes.values()).map(g => g.handIndex),
              ...Array.from(resizedBoxes.values()).flatMap(r => [r.handIndex1, r.handIndex2])
            ])}
            boxScalesRef={boxScalesRef}
            onPositionUpdate={handleBoxPositionUpdate}
          />
        </Canvas>
      </div>

      {/* Gesture Labels Overlay (outside Canvas) */}
      <GestureLabelsOverlay labels={gestureLabels} />

      {/* Box Action Labels Overlay (outside Canvas) */}
      <BoxActionLabelsOverlay labels={boxActionLabels} />

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

// Helper component to capture Three.js camera
function CameraCapture({ cameraRef }: { cameraRef: RefObject<any> }) {
  const { camera } = useThree()
  
  useEffect(() => {
    cameraRef.current = camera
  }, [camera, cameraRef])
  
  return null
}

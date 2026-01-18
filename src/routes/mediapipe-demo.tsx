import { createFileRoute } from '@tanstack/react-router'
import { Suspense, useEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useAtomState } from '@/core/lib/state'
import {
  useMediapipeResource,
  useMediapipeStatus,
} from '@/core/lib/mediapipe/system'

export const Route = createFileRoute('/mediapipe-demo')({
  component: MediaPipeDemoPage,
})

function MediaPipeDemoPage() {
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
          <MediaPipeCanvas />
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}

function LoadingScreen() {
  const { isLoading, isIdle, startSystem } = useMediapipeStatus()

  // Auto-start the system when idle
  useEffect(() => {
    if (isIdle) {
      startSystem()
    }
  }, [isIdle, startSystem])

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
        {isLoading ? 'Loading MediaPipe...' : 'Initializing...'}
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
        Failed to initialize MediaPipe
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

function MediaPipeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  // Get resources from the system (suspends until ready)
  const runtime = useMediapipeResource('runtime')
  const canvas = useMediapipeResource('canvas')

  // Mount canvas into container with auto-resize enabled
  canvas.useContainer(containerRef, { autoResize: true })

  // Subscribe to runtime state for display
  const runtimeState = useAtomState(runtime.state)

  // Start the system on mount
  useEffect(() => {
    runtime.commands.start()

    return () => {
      runtime.commands.stop()
    }
  }, [runtime])

  const handleVideoDeviceChange = async (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const deviceId = event.target.value
    runtime.commands.setVideoDevice(deviceId)
  }

  const handleAudioDeviceChange = async (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const deviceId = event.target.value
    runtime.commands.setAudioDevice(deviceId || null, Boolean(deviceId))
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      />
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
              transition: 'all 0.2s',
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
              transition: 'all 0.2s',
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

          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Audio
            <select
              value={runtimeState.selectedAudioDeviceId}
              onChange={handleAudioDeviceChange}
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
              <option value="">None</option>
              {runtimeState.audioDevices.map((device: MediaDeviceInfo) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Mic ${device.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}

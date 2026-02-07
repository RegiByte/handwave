/**
 * FPS Display Component
 *
 * HTML overlay showing rendering and detection FPS.
 * Positioned in top-left corner.
 */

import { useAtomState } from '@handwave/system'
import type { LoopResource } from '@handwave/mediapipe'
import { useEffect, useState } from 'react'
import { Throttler } from '@tanstack/pacer'

interface FPSDisplayProps {
  loop: LoopResource
}

export function FPSDisplay({ loop }: FPSDisplayProps) {
  const [displayFPS, setDisplayFPS] = useState({ render: 0, detection: 0 })


  useEffect(() => {
    const throttler = new Throttler((renderFps, detectionFps) => {
      setDisplayFPS({
        render: renderFps,
        detection: detectionFps,
      })
    }, {
      wait: 250
    })
    const unsubscribe = loop.state.subscribe((state) => {
      throttler.maybeExecute(state.fps, state.workerFPS)
    })

    return () => {
      unsubscribe()
      throttler.cancel()
    }
  }, [loop])

  const renderFPS = displayFPS.render
  const detectionFPS = displayFPS.detection

  // Color based on FPS (green >= 55, yellow >= 30, red < 30)
  const getRenderColor = (fps: number) => {
    if (fps >= 55) return '#00FF88'
    if (fps >= 30) return '#FFD700'
    return '#FF6B6B'
  }

  const getDetectionColor = (fps: number) => {
    if (fps >= 25) return '#00BFFF'
    if (fps >= 15) return '#FFD700'
    return '#FF6B6B'
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        background: 'rgba(0, 0, 0, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        padding: '8px 12px',
        fontFamily: 'monospace',
        fontSize: 14,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <div style={{ color: getRenderColor(renderFPS), marginBottom: 4 }}>
        Render: {renderFPS} FPS
      </div>
      <div style={{ color: getDetectionColor(detectionFPS) }}>
        Detection: {detectionFPS} FPS
      </div>
    </div>
  )
}

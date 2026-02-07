/**
 * Debug Overlay Component
 *
 * Shows real-time debug information about hand tracking.
 */

interface DebugInfo {
  handIndex: number
  handedness: string
  z: number
  depthScale: number
  sphereScale: number
  visible: boolean
}

interface DebugOverlayProps {
  hands: DebugInfo[]
}

export function DebugOverlay({ hands }: DebugOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        left: 16,
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#00FF88',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: 12,
        borderRadius: 4,
        border: '1px solid #00FF88',
        zIndex: 10,
        minWidth: 300,
      }}
    >
      <div style={{ marginBottom: 8, fontWeight: 'bold', color: '#fff' }}>
        🐛 Hand Tracking Debug
      </div>
      {hands.length === 0 && (
        <div style={{ color: '#888' }}>No hands detected</div>
      )}
      {hands.map((hand) => (
        <div
          key={hand.handIndex}
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid #333',
          }}
        >
          <div style={{ color: '#fff', marginBottom: 4 }}>
            Hand {hand.handIndex + 1} ({hand.handedness})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 4 }}>
            <div>MediaPipe Z:</div>
            <div style={{ color: hand.z < 0 ? '#FF6B9D' : '#4169e1' }}>
              {hand.z.toFixed(4)} {hand.z < 0 ? '(close)' : '(far)'}
            </div>
            
            <div>Depth Scale:</div>
            <div>{hand.depthScale.toFixed(3)}x</div>
            
            <div>Final Scale:</div>
            <div>{hand.sphereScale.toFixed(3)}x</div>
            
            <div>Visible:</div>
            <div>{hand.visible ? '✓ Yes' : '✗ No'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

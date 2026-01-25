/**
 * Recording Utilities
 *
 * Helper functions for working with recorded sessions.
 * Load, filter, and extract frames for test fixture generation.
 */

import type { RecordedFrame, RecordingSession} from '@handwave/intent-engine';
import { detectionKeywords, recordingSessionSchema } from '@handwave/intent-engine'

// ============================================================================
// Load & Validate
// ============================================================================

/**
 * Load recording from JSON string
 * @throws {Error} if JSON is invalid or doesn't match schema
 */
export function loadRecording(json: string): RecordingSession {
  const parsed = JSON.parse(json)
  const result = recordingSessionSchema.safeParse(parsed)

  if (!result.success) {
    throw new Error(
      `Invalid recording format: ${result.error.issues
        .map((e) => e.message)
        .join(', ')}`,
    )
  }

  return result.data
}

/**
 * Validate a recording session
 */
export function validateRecording(session: unknown): {
  valid: boolean
  errors: Array<string>
} {
  const result = recordingSessionSchema.safeParse(session)

  if (result.success) {
    return { valid: true, errors: [] }
  }

  return {
    valid: false,
    errors: result.error.issues.map((e) => e.message),
  }
}

// ============================================================================
// Filtering & Querying
// ============================================================================

/**
 * Extract specific frames by criteria
 */
export function filterFrames(
  session: RecordingSession,
  predicate: (frame: RecordedFrame) => boolean,
): Array<RecordedFrame> {
  return session.frames.filter(predicate)
}

/**
 * Find frames with specific gestures
 */
export function findGestureFrames(
  session: RecordingSession,
  gesture: string,
  hand: 'left' | 'right',
): Array<RecordedFrame> {
  return filterFrames(session, (frame) => {
    return (
      frame.detectionFrame?.detectors?.hand?.some(
        (h) => h.gesture === gesture && h.handedness === detectionKeywords.handedness[hand],
      ) ?? false
    )
  })
}

/**
 * Find frames where hand is in specific cell
 */
export function findCellFrames(
  session: RecordingSession,
  col: number,
  row: number,
): Array<RecordedFrame> {
  return filterFrames(session, (frame) => {
    return frame.spatial.handCells.some(
      (hc) => hc.cell.col === col && hc.cell.row === row,
    )
  })
}

/**
 * Find frames with specific hand count
 */
export function findHandCountFrames(
  session: RecordingSession,
  count: number,
): Array<RecordedFrame> {
  return filterFrames(session, (frame) => {
    return (frame.detectionFrame?.detectors?.hand?.length ?? 0) === count
  })
}

/**
 * Get frames in time range
 */
export function getFramesInTimeRange(
  session: RecordingSession,
  startMs: number,
  endMs: number,
): Array<RecordedFrame> {
  return filterFrames(session, (frame) => {
    const relativeTime = frame.timestamp - session.startTime
    return relativeTime >= startMs && relativeTime <= endMs
  })
}

// ============================================================================
// Test Fixture Generation
// ============================================================================

/**
 * Export frames as TypeScript test fixture
 */
export function createTestFixture(
  session: RecordingSession,
  name: string,
  frameIndices: Array<number>,
): string {
  const frames = frameIndices
    .filter((i) => i >= 0 && i < session.frames.length)
    .map((i) => session.frames[i])

  const fixture = {
    name,
    description: session.metadata.description || 'Test fixture',
    sessionId: session.sessionId,
    frameCount: frames.length,
    frames,
  }

  return `// Generated from recording session: ${session.sessionId}
// ${session.metadata.description || 'No description'}
// Frames: ${frameIndices.join(', ')}

export const ${name} = ${JSON.stringify(fixture, null, 2)} as const
`
}

/**
 * Export all frames matching gesture as fixture
 */
export function createGestureFixture(
  session: RecordingSession,
  gesture: string,
  hand: 'left' | 'right',
  fixtureName?: string,
): string {
  const frames = findGestureFrames(session, gesture, hand)
  const name = fixtureName || `${gesture.toLowerCase()}${hand}Frames`
  const indices = frames.map((f) => f.frameIndex)

  return createTestFixture(session, name, indices)
}

// ============================================================================
// Statistics & Analysis
// ============================================================================

/**
 * Get recording statistics
 */
export function getRecordingStats(session: RecordingSession): {
  duration: number
  frameCount: number
  avgFPS: number
  uniqueGestures: Set<string>
  handednessDistribution: { Left: number; Right: number; Both: number }
} {
  const duration = session.endTime - session.startTime

  const gestures = new Set<string>()
  let leftHandFrames = 0
  let rightHandFrames = 0
  let bothHandsFrames = 0

  session.frames.forEach((frame) => {
    const hands = frame.detectionFrame?.detectors?.hand || []
    hands.forEach((h) => gestures.add(h.gesture))

    const hasLeft = hands.some((h) => h.handedness === detectionKeywords.handedness.left)
    const hasRight = hands.some((h) => h.handedness === detectionKeywords.handedness.right)

    if (hasLeft && hasRight) bothHandsFrames++
    else if (hasLeft) leftHandFrames++
    else if (hasRight) rightHandFrames++
  })

  return {
    duration,
    frameCount: session.frameCount,
    avgFPS: (session.frameCount / duration) * 1000,
    uniqueGestures: gestures,
    handednessDistribution: {
      Left: leftHandFrames,
      Right: rightHandFrames,
      Both: bothHandsFrames,
    },
  }
}

/**
 * Print recording summary to console
 */
export function printRecordingSummary(session: RecordingSession): void {
  const stats = getRecordingStats(session)

  console.log('\n=== Recording Summary ===')
  console.log(`Session ID: ${session.sessionId}`)
  console.log(`Description: ${session.metadata.description || 'None'}`)
  console.log(`Duration: ${(stats.duration / 1000).toFixed(2)}s`)
  console.log(`Frames: ${stats.frameCount}`)
  console.log(`Avg FPS: ${stats.avgFPS.toFixed(1)}`)
  console.log(`Gestures: ${Array.from(stats.uniqueGestures).join(', ')}`)
  console.log('\nHandedness Distribution:')
  console.log(`  Left only: ${stats.handednessDistribution.Left} frames`)
  console.log(`  Right only: ${stats.handednessDistribution.Right} frames`)
  console.log(`  Both hands: ${stats.handednessDistribution.Both} frames`)
  console.log('========================\n')
}

// ============================================================================
// Export Helpers
// ============================================================================

/**
 * Save recording to file (browser)
 */
export function downloadRecording(
  session: RecordingSession,
  filename?: string,
): void {
  const json = JSON.stringify(session, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `recording-${session.sessionId}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Copy recording JSON to clipboard
 */
export async function copyRecordingToClipboard(
  session: RecordingSession,
): Promise<void> {
  const json = JSON.stringify(session, null, 2)
  await navigator.clipboard.writeText(json)
}

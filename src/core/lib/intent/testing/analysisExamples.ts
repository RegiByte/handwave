/**
 * Recording Data Analysis Examples
 *
 * Example scripts for analyzing recording data and extracting patterns.
 * Use these as a starting point for understanding your captured data.
 */

import {
  createGestureFixture,
  filterFrames,
  findGestureFrames,
  getRecordingStats,
  loadRecording,
  printRecordingSummary,
} from '@/core/lib/intent/testing'
import type {
  RecordedFrame,
  RecordingSession,
} from '@/core/lib/intent/vocabulary'

// ============================================================================
// Basic Analysis
// ============================================================================

/**
 * Analyze a recording and print summary
 */
export async function analyzeRecording(jsonPath: string) {
  const json = await fetch(jsonPath).then((r) => r.text())
  const session = loadRecording(json)

  console.log('\n=== Recording Analysis ===\n')
  printRecordingSummary(session)

  const stats = getRecordingStats(session)
  console.log('\nDetailed Stats:')
  console.log(`  Duration: ${(stats.duration / 1000).toFixed(2)}s`)
  console.log(`  Frame Count: ${stats.frameCount}`)
  console.log(`  Avg FPS: ${stats.avgFPS.toFixed(1)}`)
  console.log(
    `  Unique Gestures: ${Array.from(stats.uniqueGestures).join(', ')}`,
  )

  return session
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Find high-confidence gesture frames
 */
export function findCleanGestures(
  session: RecordingSession,
  minScore = 0.85,
): Array<RecordedFrame> {
  return filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some((h) => h.gestureScore >= minScore) ??
      false
    )
  })
}

/**
 * Find stable gesture sequences (gesture held for N consecutive frames)
 */
export function findStableSequences(
  session: RecordingSession,
  gesture: string,
  hand: 'Left' | 'Right',
  minFrames = 10,
): Array<Array<RecordedFrame>> {
  const sequences: Array<Array<RecordedFrame>> = []
  let currentSequence: Array<RecordedFrame> = []

  for (const frame of session.frames) {
    const hasGesture = frame.gestureResult?.hands.some(
      (h) => h.gesture === gesture && h.handedness === hand,
    )

    if (hasGesture) {
      currentSequence.push(frame)
    } else {
      if (currentSequence.length >= minFrames) {
        sequences.push(currentSequence)
      }
      currentSequence = []
    }
  }

  // Check last sequence
  if (currentSequence.length >= minFrames) {
    sequences.push(currentSequence)
  }

  return sequences
}

/**
 * Analyze gesture score distribution
 */
export function analyzeGestureScores(session: RecordingSession) {
  const scoresByGesture: Record<string, Array<number>> = {}

  session.frames.forEach((frame) => {
    frame.gestureResult?.hands.forEach((hand) => {
      if (!scoresByGesture[hand.gesture]) {
        scoresByGesture[hand.gesture] = []
      }
      scoresByGesture[hand.gesture].push(hand.gestureScore)
    })
  })

  console.log('\n=== Gesture Score Analysis ===\n')
  for (const [gesture, scores] of Object.entries(scoresByGesture)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const min = Math.min(...scores)
    const max = Math.max(...scores)
    const above90 = scores.filter((s) => s > 0.9).length

    console.log(`${gesture}:`)
    console.log(`  Count: ${scores.length} frames`)
    console.log(`  Avg: ${avg.toFixed(3)}`)
    console.log(`  Range: ${min.toFixed(3)} - ${max.toFixed(3)}`)
    console.log(
      `  >0.9: ${above90} frames (${((above90 / scores.length) * 100).toFixed(1)}%)`,
    )
  }
}

// ============================================================================
// Pinch Detection Analysis
// ============================================================================

/**
 * Calculate distance between two landmarks
 */
function distance3D(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Analyze potential pinch gestures
 */
export function analyzePinchDistances(
  session: RecordingSession,
  handedness: 'Left' | 'Right',
) {
  console.log(`\n=== Pinch Analysis (${handedness} Hand) ===\n`)

  const pinchCandidates: Array<{
    frameIndex: number
    thumbToIndex: number
    thumbToMiddle: number
    thumbToRing: number
    thumbToPinky: number
  }> = []

  session.frames.forEach((frame) => {
    const hand = frame.gestureResult?.hands.find(
      (h) => h.handedness === handedness,
    )
    if (!hand || hand.landmarks.length < 21) return

    const thumb = hand.landmarks[4]
    const index = hand.landmarks[8]
    const middle = hand.landmarks[12]
    const ring = hand.landmarks[16]
    const pinky = hand.landmarks[20]

    pinchCandidates.push({
      frameIndex: frame.frameIndex,
      thumbToIndex: distance3D(thumb, index),
      thumbToMiddle: distance3D(thumb, middle),
      thumbToRing: distance3D(thumb, ring),
      thumbToPinky: distance3D(thumb, pinky),
    })
  })

  // Find potential pinches (distance < 0.05)
  const indexPinches = pinchCandidates.filter((c) => c.thumbToIndex < 0.05)
  const middlePinches = pinchCandidates.filter((c) => c.thumbToMiddle < 0.05)

  console.log(`Potential thumb-index pinches: ${indexPinches.length} frames`)
  console.log(`Potential thumb-middle pinches: ${middlePinches.length} frames`)

  // Show distribution
  const allDistances = pinchCandidates.map((c) => c.thumbToIndex)
  const avgDistance =
    allDistances.reduce((a, b) => a + b, 0) / allDistances.length
  const minDistance = Math.min(...allDistances)

  console.log(`\nThumb-Index Distance:`)
  console.log(`  Average: ${avgDistance.toFixed(4)}`)
  console.log(`  Minimum: ${minDistance.toFixed(4)}`)
  console.log(`  Suggested pinch threshold: ${(minDistance * 1.2).toFixed(4)}`)
}

// ============================================================================
// Cell Navigation Analysis
// ============================================================================

/**
 * Analyze cell coverage
 */
export function analyzeCellCoverage(session: RecordingSession) {
  const grid = session.frames[0]?.spatial.grid || { cols: 12, rows: 8 }
  const cellCounts: Record<string, number> = {}

  session.frames.forEach((frame) => {
    frame.spatial.handCells.forEach((hc) => {
      const key = `${hc.cell.col},${hc.cell.row}`
      cellCounts[key] = (cellCounts[key] || 0) + 1
    })
  })

  const visitedCells = Object.keys(cellCounts).length
  const totalCells = grid.cols * grid.rows

  console.log('\n=== Cell Coverage Analysis ===\n')
  console.log(`Grid: ${grid.cols}×${grid.rows} (${totalCells} total cells)`)
  console.log(
    `Visited: ${visitedCells} cells (${((visitedCells / totalCells) * 100).toFixed(1)}%)`,
  )
  console.log(`\nTop 10 Most Visited Cells:`)

  const sorted = Object.entries(cellCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  sorted.forEach(([key, count]) => {
    const [col, row] = key.split(',')
    console.log(`  Cell (${col}, ${row}): ${count} frames`)
  })
}

// ============================================================================
// Fixture Generation Helpers
// ============================================================================

/**
 * Generate test fixtures for all clear gestures
 */
export async function generateAllGestureFixtures(
  session: RecordingSession,
  outputDir = 'src/core/lib/intent/__fixtures__/gestures',
) {
  const stats = getRecordingStats(session)
  const gestures = Array.from(stats.uniqueGestures).filter((g) => g !== 'None')

  console.log('\n=== Generating Fixtures ===\n')

  for (const gesture of gestures) {
    for (const hand of ['Left', 'Right'] as const) {
      const frames = findGestureFrames(session, gesture, hand)
      const cleanFrames = frames.filter(
        (f) => f.gestureResult?.hands[0]?.gestureScore > 0.85,
      )

      if (cleanFrames.length > 0) {
        const fixtureName = `${gesture.toLowerCase()}${hand}Frames`
        const fixture = createGestureFixture(
          session,
          gesture,
          hand,
          fixtureName,
        )

        console.log(`Generated: ${fixtureName} (${cleanFrames.length} frames)`)
        console.log(
          `  Save to: ${outputDir}/${gesture.toLowerCase()}-${hand.toLowerCase()}.ts`,
        )
        console.log(fixture.split('\n').slice(0, 5).join('\n') + '\n...\n')
      }
    }
  }
}

// ============================================================================
// Example Usage
// ============================================================================

/**
 * Complete analysis workflow
 */
export async function completeAnalysis(jsonPath: string) {
  console.log('Loading recording...')
  const session = await analyzeRecording(jsonPath)

  console.log('\n--- Gesture Quality ---')
  analyzeGestureScores(session)

  console.log('\n--- Pinch Detection ---')
  analyzePinchDistances(session, 'Right')
  analyzePinchDistances(session, 'Left')

  console.log('\n--- Cell Coverage ---')
  analyzeCellCoverage(session)

  console.log('\n--- Fixture Generation ---')
  await generateAllGestureFixtures(session)

  console.log('\n✅ Analysis complete!')
}

// Example: Run complete analysis
// completeAnalysis('/recordings/recording-session-123.json')

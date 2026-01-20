#!/usr/bin/env tsx
/**
 * Recording Analysis Script
 *
 * Analyzes a recording session to understand:
 * - Gesture patterns and confidence scores
 * - Finger-to-thumb distances for pinch detection
 * - Spatial distribution and cell coverage
 * - High-quality frames for test fixtures
 *
 * Usage: npx tsx scripts/analyze-recording.ts <path-to-recording.json>
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calculateDistance3D } from '@/core/lib/intent'
import {
  findGestureFrames,
  getRecordingStats,
  loadRecording,
  printRecordingSummary,
} from '@/core/lib/intent/testing/recordingUtils'
import type { RecordingSession } from '@/core/lib/intent/vocabulary/recordingSchemas'

// ============================================================================
// Gesture Analysis
// ============================================================================

interface GestureStats {
  gesture: string
  count: number
  avgScore: number
  minScore: number
  maxScore: number
  stdDev: number
  above90Count: number
  above80Count: number
  above70Count: number
}

function analyzeGestureConfidence(
  session: RecordingSession,
): Array<GestureStats> {
  const scoresByGesture: Record<string, Array<number>> = {}

  session.frames.forEach((frame) => {
    frame.gestureResult?.hands.forEach((hand) => {
      if (!scoresByGesture[hand.gesture]) {
        scoresByGesture[hand.gesture] = []
      }
      scoresByGesture[hand.gesture].push(hand.gestureScore)
    })
  })

  const stats: Array<GestureStats> = []

  for (const [gesture, scores] of Object.entries(scoresByGesture)) {
    const count = scores.length
    const avg = scores.reduce((a, b) => a + b, 0) / count
    const min = Math.min(...scores)
    const max = Math.max(...scores)

    // Calculate standard deviation
    const variance =
      scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / count
    const stdDev = Math.sqrt(variance)

    const above90 = scores.filter((s) => s >= 0.9).length
    const above80 = scores.filter((s) => s >= 0.8).length
    const above70 = scores.filter((s) => s >= 0.7).length

    stats.push({
      gesture,
      count,
      avgScore: avg,
      minScore: min,
      maxScore: max,
      stdDev,
      above90Count: above90,
      above80Count: above80,
      above70Count: above70,
    })
  }

  return stats.sort((a, b) => b.count - a.count)
}

function printGestureAnalysis(stats: Array<GestureStats>): void {
  console.log(
    '\n╔══════════════════════════════════════════════════════════════╗',
  )
  console.log(
    '║              GESTURE CONFIDENCE ANALYSIS                     ║',
  )
  console.log(
    '╚══════════════════════════════════════════════════════════════╝\n',
  )

  stats.forEach((stat) => {
    console.log(`📊 ${stat.gesture}`)
    console.log(`   Frames: ${stat.count}`)
    console.log(
      `   Confidence: ${stat.avgScore.toFixed(3)} ± ${stat.stdDev.toFixed(3)}`,
    )
    console.log(
      `   Range: ${stat.minScore.toFixed(3)} → ${stat.maxScore.toFixed(3)}`,
    )
    console.log(
      `   High Quality (>0.9): ${stat.above90Count} (${((stat.above90Count / stat.count) * 100).toFixed(1)}%)`,
    )
    console.log(
      `   Good Quality (>0.8): ${stat.above80Count} (${((stat.above80Count / stat.count) * 100).toFixed(1)}%)`,
    )
    console.log(
      `   Usable (>0.7): ${stat.above70Count} (${((stat.above70Count / stat.count) * 100).toFixed(1)}%)`,
    )
    console.log()
  })
}

// ============================================================================
// Finger-to-Thumb Distance Analysis
// ============================================================================

interface FingerDistance {
  frameIndex: number
  timestamp: number
  gesture: string
  gestureScore: number
  thumbToIndex: number
  thumbToMiddle: number
  thumbToRing: number
  thumbToPinky: number
}

function analyzeFingerDistances(
  session: RecordingSession,
  handedness: 'Left' | 'Right',
): Array<FingerDistance> {
  const distances: Array<FingerDistance> = []

  session.frames.forEach((frame) => {
    const hand = frame.gestureResult?.hands.find(
      (h) => h.handedness === handedness,
    )
    if (!hand || hand.landmarks.length < 21) return

    // MediaPipe hand landmark indices:
    // 4 = thumb tip, 8 = index tip, 12 = middle tip, 16 = ring tip, 20 = pinky tip
    const thumb = hand.landmarks[4]
    const index = hand.landmarks[8]
    const middle = hand.landmarks[12]
    const ring = hand.landmarks[16]
    const pinky = hand.landmarks[20]

    distances.push({
      frameIndex: frame.frameIndex,
      timestamp: frame.timestamp,
      gesture: hand.gesture,
      gestureScore: hand.gestureScore,
      thumbToIndex: calculateDistance3D(thumb, index),
      thumbToMiddle: calculateDistance3D(thumb, middle),
      thumbToRing: calculateDistance3D(thumb, ring),
      thumbToPinky: calculateDistance3D(thumb, pinky),
    })
  })

  return distances
}

interface FingerDistanceStats {
  finger: string
  avgDistance: number
  minDistance: number
  maxDistance: number
  stdDev: number
  potentialPinches: number
  suggestedThreshold: number
}

function analyzeFingerDistanceStats(
  distances: Array<FingerDistance>,
): Array<FingerDistanceStats> {
  const fingers = ['Index', 'Middle', 'Ring', 'Pinky'] as const
  const stats: Array<FingerDistanceStats> = []

  fingers.forEach((finger) => {
    const key = `thumbTo${finger}` as keyof FingerDistance
    const values = distances.map((d) => d[key] as number)

    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const min = Math.min(...values)
    const max = Math.max(...values)

    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
      values.length
    const stdDev = Math.sqrt(variance)

    // Count potential pinches (distance < threshold)
    const threshold = min * 1.5 // 50% above minimum
    const potentialPinches = values.filter((v) => v < threshold).length

    stats.push({
      finger,
      avgDistance: avg,
      minDistance: min,
      maxDistance: max,
      stdDev,
      potentialPinches,
      suggestedThreshold: threshold,
    })
  })

  return stats
}

function printFingerDistanceAnalysis(
  handedness: 'Left' | 'Right',
  distances: Array<FingerDistance>,
  stats: Array<FingerDistanceStats>,
): void {
  console.log(
    `\n╔══════════════════════════════════════════════════════════════╗`,
  )
  console.log(
    `║         FINGER-TO-THUMB DISTANCE (${handedness.toUpperCase()} HAND)              ║`,
  )
  console.log(
    `╚══════════════════════════════════════════════════════════════╝\n`,
  )

  console.log(`Total frames analyzed: ${distances.length}\n`)

  stats.forEach((stat) => {
    console.log(`👆 Thumb → ${stat.finger}`)
    console.log(
      `   Average: ${stat.avgDistance.toFixed(4)} ± ${stat.stdDev.toFixed(4)}`,
    )
    console.log(
      `   Range: ${stat.minDistance.toFixed(4)} → ${stat.maxDistance.toFixed(4)}`,
    )
    console.log(`   Potential Pinches: ${stat.potentialPinches} frames`)
    console.log(`   Suggested Threshold: ${stat.suggestedThreshold.toFixed(4)}`)
    console.log()
  })

  // Find frames with closest contacts
  console.log('🎯 Closest Contact Frames:\n')

  const fingerKeys = [
    'thumbToIndex',
    'thumbToMiddle',
    'thumbToRing',
    'thumbToPinky',
  ] as const
  fingerKeys.forEach((key, idx) => {
    const sorted = [...distances].sort((a, b) => a[key] - b[key])
    const closest = sorted.slice(0, 3)

    console.log(`   ${stats[idx].finger}:`)
    closest.forEach((d, i) => {
      console.log(
        `     ${i + 1}. Frame ${d.frameIndex}: ${d[key].toFixed(4)} (${d.gesture}, score: ${d.gestureScore.toFixed(2)})`,
      )
    })
    console.log()
  })
}

// ============================================================================
// Gesture Recognition Analysis
// ============================================================================

function analyzeGestureRecognition(session: RecordingSession): void {
  console.log(
    '\n╔══════════════════════════════════════════════════════════════╗',
  )
  console.log(
    '║              GESTURE RECOGNITION PATTERNS                    ║',
  )
  console.log(
    '╚══════════════════════════════════════════════════════════════╝\n',
  )

  const stats = getRecordingStats(session)
  const gestures = Array.from(stats.uniqueGestures).filter((g) => g !== 'None')

  if (gestures.length === 0) {
    console.log('⚠️  No gestures detected (only "None")\n')
    return
  }

  gestures.forEach((gesture) => {
    console.log(`\n🤚 ${gesture}`)

    const leftFrames = findGestureFrames(session, gesture, 'Left')
    const rightFrames = findGestureFrames(session, gesture, 'Right')

    if (leftFrames.length > 0) {
      const highQuality = leftFrames.filter(
        (f) =>
          f.gestureResult?.hands.find((h) => h.handedness === 'Left')
            ?.gestureScore ?? 0 > 0.85,
      )
      console.log(
        `   Left Hand: ${leftFrames.length} frames (${highQuality.length} high quality)`,
      )
    }

    if (rightFrames.length > 0) {
      const highQuality = rightFrames.filter(
        (f) =>
          f.gestureResult?.hands.find((h) => h.handedness === 'Right')
            ?.gestureScore ?? 0 > 0.85,
      )
      console.log(
        `   Right Hand: ${rightFrames.length} frames (${highQuality.length} high quality)`,
      )
    }
  })
  console.log()
}

// ============================================================================
// Cell Coverage Analysis
// ============================================================================

function analyzeCellCoverage(session: RecordingSession): void {
  console.log(
    '\n╔══════════════════════════════════════════════════════════════╗',
  )
  console.log(
    '║                SPATIAL CELL COVERAGE                         ║',
  )
  console.log(
    '╚══════════════════════════════════════════════════════════════╝\n',
  )

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

  console.log(`Grid: ${grid.cols}×${grid.rows} (${totalCells} total cells)`)
  console.log(
    `Visited: ${visitedCells} cells (${((visitedCells / totalCells) * 100).toFixed(1)}%)`,
  )
  console.log(`\nTop 10 Most Visited Cells:`)

  const sorted = Object.entries(cellCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  sorted.forEach(([key, count], idx) => {
    const [col, row] = key.split(',')
    console.log(`   ${idx + 1}. Cell (${col}, ${row}): ${count} frames`)
  })
  console.log()
}

// ============================================================================
// Main Analysis
// ============================================================================

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error(
      'Usage: npx tsx scripts/analyze-recording.ts <path-to-recording.json>',
    )
    process.exit(1)
  }

  const recordingPath = resolve(process.cwd(), args[0])

  console.log(`\n📂 Loading recording: ${recordingPath}`)

  try {
    const json = readFileSync(recordingPath, 'utf-8')
    const session = loadRecording(json)

    console.log('✅ Recording loaded successfully!\n')

    // Basic summary
    printRecordingSummary(session)

    // Gesture confidence analysis
    const gestureStats = analyzeGestureConfidence(session)
    printGestureAnalysis(gestureStats)

    // Gesture recognition patterns
    analyzeGestureRecognition(session)

    // Finger distance analysis for both hands
    const leftDistances = analyzeFingerDistances(session, 'Left')
    if (leftDistances.length > 0) {
      const leftStats = analyzeFingerDistanceStats(leftDistances)
      printFingerDistanceAnalysis('Left', leftDistances, leftStats)
    }

    const rightDistances = analyzeFingerDistances(session, 'Right')
    if (rightDistances.length > 0) {
      const rightStats = analyzeFingerDistanceStats(rightDistances)
      printFingerDistanceAnalysis('Right', rightDistances, rightStats)
    }

    // Cell coverage
    analyzeCellCoverage(session)

    console.log('\n✨ Analysis complete!\n')
  } catch (error) {
    console.error(
      '❌ Error:',
      error instanceof Error ? error.message : String(error),
    )
    process.exit(1)
  }
}

main()

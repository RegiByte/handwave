#!/usr/bin/env tsx
/**
 * Extract Test Fixtures Script
 *
 * Extracts high-quality frames from recordings and generates TypeScript test fixtures.
 * Based on the analysis results, we extract:
 * - Pinch contact frames (finger-to-thumb)
 * - Gesture frames (high confidence)
 * - Spatial frames (specific cells)
 *
 * Usage: npx tsx scripts/extract-fixtures.ts <path-to-recording.json>
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  createTestFixture,
  filterFrames,
  loadRecording,
} from '../packages/demo/src/core/lib/intent/testing/recordingUtils'
import type { RecordedFrame } from '@handwave/intent-engine'
import { calculateDistance3D } from '../packages/demo/src/core/lib/intent/index'

// ============================================================================
// Fixture Extraction
// ============================================================================

interface FixtureConfig {
  name: string
  description: string
  frameIndices: Array<number>
  outputPath: string
}

function findPinchFrames(recordingPath: string): Array<FixtureConfig> {
  const json = readFileSync(recordingPath, 'utf-8')
  const session = loadRecording(json)

  const fixtures: Array<FixtureConfig> = []

  // Helper to find closest pinches for a specific finger
  const findClosestPinches = (
    handedness: 'Left' | 'Right',
    fingerIndex: number,
    _fingerName: string,
    count: number = 5,
  ) => {
    return session.frames
      .map((frame, arrayIndex) => {
        const hand = frame.gestureResult?.hands.find(
          (h) => h.handedness === handedness,
        )
        if (!hand || hand.landmarks.length < 21) return null

        const distance = calculateDistance3D(
          hand.landmarks[4],
          hand.landmarks[fingerIndex],
        )
        return { arrayIndex, distance }
      })
      .filter((x): x is { arrayIndex: number; distance: number } => x !== null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, count)
      .map((x) => x.arrayIndex)
  }

  // Left hand pinches
  const leftIndexIndices = findClosestPinches('Left', 8, 'Index')
  if (leftIndexIndices.length > 0) {
    fixtures.push({
      name: 'leftIndexPinchFrames',
      description: 'Left hand thumb-index pinch contact',
      frameIndices: leftIndexIndices,
      outputPath: 'src/core/lib/intent/__fixtures__/pinch/left-index-pinch.ts',
    })
  }

  const leftMiddleIndices = findClosestPinches('Left', 12, 'Middle')
  if (leftMiddleIndices.length > 0) {
    fixtures.push({
      name: 'leftMiddlePinchFrames',
      description: 'Left hand thumb-middle pinch contact',
      frameIndices: leftMiddleIndices,
      outputPath: 'src/core/lib/intent/__fixtures__/pinch/left-middle-pinch.ts',
    })
  }

  const leftRingIndices = findClosestPinches('Left', 16, 'Ring')
  if (leftRingIndices.length > 0) {
    fixtures.push({
      name: 'leftRingPinchFrames',
      description: 'Left hand thumb-ring pinch contact',
      frameIndices: leftRingIndices,
      outputPath: 'src/core/lib/intent/__fixtures__/pinch/left-ring-pinch.ts',
    })
  }

  const leftPinkyIndices = findClosestPinches('Left', 20, 'Pinky')
  if (leftPinkyIndices.length > 0) {
    fixtures.push({
      name: 'leftPinkyPinchFrames',
      description: 'Left hand thumb-pinky pinch contact',
      frameIndices: leftPinkyIndices,
      outputPath: 'src/core/lib/intent/__fixtures__/pinch/left-pinky-pinch.ts',
    })
  }

  // Right hand pinches
  const rightIndexIndices = findClosestPinches('Right', 8, 'Index')
  if (rightIndexIndices.length > 0) {
    fixtures.push({
      name: 'rightIndexPinchFrames',
      description: 'Right hand thumb-index pinch contact',
      frameIndices: rightIndexIndices,
      outputPath: 'src/core/lib/intent/__fixtures__/pinch/right-index-pinch.ts',
    })
  }

  const rightMiddleIndices = findClosestPinches('Right', 12, 'Middle')
  if (rightMiddleIndices.length > 0) {
    fixtures.push({
      name: 'rightMiddlePinchFrames',
      description: 'Right hand thumb-middle pinch contact',
      frameIndices: rightMiddleIndices,
      outputPath:
        'src/core/lib/intent/__fixtures__/pinch/right-middle-pinch.ts',
    })
  }

  const rightRingIndices = findClosestPinches('Right', 16, 'Ring')
  if (rightRingIndices.length > 0) {
    fixtures.push({
      name: 'rightRingPinchFrames',
      description: 'Right hand thumb-ring pinch contact',
      frameIndices: rightRingIndices,
      outputPath: 'src/core/lib/intent/__fixtures__/pinch/right-ring-pinch.ts',
    })
  }

  const rightPinkyIndices = findClosestPinches('Right', 20, 'Pinky')
  if (rightPinkyIndices.length > 0) {
    fixtures.push({
      name: 'rightPinkyPinchFrames',
      description: 'Right hand thumb-pinky pinch contact',
      frameIndices: rightPinkyIndices,
      outputPath: 'src/core/lib/intent/__fixtures__/pinch/right-pinky-pinch.ts',
    })
  }

  return fixtures
}

function findGestureFixtures(recordingPath: string): Array<FixtureConfig> {
  const json = readFileSync(recordingPath, 'utf-8')
  const session = loadRecording(json)

  const fixtures: Array<FixtureConfig> = []

  // Helper to get array indices from frames
  const getArrayIndices = (frames: Array<RecordedFrame>): Array<number> => {
    return frames
      .map((frame) =>
        session.frames.findIndex((f) => f.frameIndex === frame.frameIndex),
      )
      .filter((idx) => idx !== -1)
  }

  // Find high-quality "None" gesture frames (>0.9 confidence)
  const highQualityNone = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'None' && h.gestureScore > 0.9,
      ) ?? false
    )
  }).slice(0, 10) // Take first 10

  if (highQualityNone.length > 0) {
    fixtures.push({
      name: 'noneGestureFrames',
      description: 'High-quality "None" gesture frames (>0.9 confidence)',
      frameIndices: getArrayIndices(highQualityNone),
      outputPath: 'src/core/lib/intent/__fixtures__/gestures/none-gesture.ts',
    })
  }

  // Find Open_Palm frames (left hand)
  const openPalmLeft = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Open_Palm' && h.handedness === 'Left',
      ) ?? false
    )
  }).slice(0, 10)

  if (openPalmLeft.length > 0) {
    fixtures.push({
      name: 'openPalmLeftFrames',
      description: 'Open_Palm gesture - Left hand',
      frameIndices: getArrayIndices(openPalmLeft),
      outputPath: 'src/core/lib/intent/__fixtures__/gestures/open-palm-left.ts',
    })
  }

  // Find Open_Palm frames (right hand)
  const openPalmRight = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Open_Palm' && h.handedness === 'Right',
      ) ?? false
    )
  }).slice(0, 10)

  if (openPalmRight.length > 0) {
    fixtures.push({
      name: 'openPalmRightFrames',
      description: 'Open_Palm gesture - Right hand',
      frameIndices: getArrayIndices(openPalmRight),
      outputPath:
        'src/core/lib/intent/__fixtures__/gestures/open-palm-right.ts',
    })
  }

  // Find Victory frames (left hand)
  const victoryLeft = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Victory' && h.handedness === 'Left',
      ) ?? false
    )
  }).slice(0, 10)

  if (victoryLeft.length > 0) {
    fixtures.push({
      name: 'victoryLeftFrames',
      description: 'Victory gesture - Left hand',
      frameIndices: getArrayIndices(victoryLeft),
      outputPath: 'src/core/lib/intent/__fixtures__/gestures/victory-left.ts',
    })
  }

  // Find Victory frames (right hand)
  const victoryRight = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Victory' && h.handedness === 'Right',
      ) ?? false
    )
  }).slice(0, 10)

  if (victoryRight.length > 0) {
    fixtures.push({
      name: 'victoryRightFrames',
      description: 'Victory gesture - Right hand',
      frameIndices: getArrayIndices(victoryRight),
      outputPath: 'src/core/lib/intent/__fixtures__/gestures/victory-right.ts',
    })
  }

  // Find Thumb_Up frames (left hand)
  const thumbUpLeft = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Thumb_Up' && h.handedness === 'Left',
      ) ?? false
    )
  }).slice(0, 10)

  if (thumbUpLeft.length > 0) {
    fixtures.push({
      name: 'thumbUpLeftFrames',
      description: 'Thumb_Up gesture - Left hand',
      frameIndices: getArrayIndices(thumbUpLeft),
      outputPath: 'src/core/lib/intent/__fixtures__/gestures/thumb-up-left.ts',
    })
  }

  // Find Thumb_Up frames (right hand)
  const thumbUpRight = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Thumb_Up' && h.handedness === 'Right',
      ) ?? false
    )
  }).slice(0, 10)

  if (thumbUpRight.length > 0) {
    fixtures.push({
      name: 'thumbUpRightFrames',
      description: 'Thumb_Up gesture - Right hand',
      frameIndices: getArrayIndices(thumbUpRight),
      outputPath: 'src/core/lib/intent/__fixtures__/gestures/thumb-up-right.ts',
    })
  }

  // Find Closed_Fist frames (left hand)
  const closedFistLeft = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Closed_Fist' && h.handedness === 'Left',
      ) ?? false
    )
  }).slice(0, 10)

  if (closedFistLeft.length > 0) {
    fixtures.push({
      name: 'closedFistLeftFrames',
      description: 'Closed_Fist gesture - Left hand',
      frameIndices: getArrayIndices(closedFistLeft),
      outputPath:
        'src/core/lib/intent/__fixtures__/gestures/closed-fist-left.ts',
    })
  }

  // Find Closed_Fist frames (right hand)
  const closedFistRight = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Closed_Fist' && h.handedness === 'Right',
      ) ?? false
    )
  }).slice(0, 10)

  if (closedFistRight.length > 0) {
    fixtures.push({
      name: 'closedFistRightFrames',
      description: 'Closed_Fist gesture - Right hand',
      frameIndices: getArrayIndices(closedFistRight),
      outputPath:
        'src/core/lib/intent/__fixtures__/gestures/closed-fist-right.ts',
    })
  }

  // Find Thumb_Down frames (left hand)
  const thumbDownLeft = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Thumb_Down' && h.handedness === 'Left',
      ) ?? false
    )
  }).slice(0, 10)

  if (thumbDownLeft.length > 0) {
    fixtures.push({
      name: 'thumbDownLeftFrames',
      description: 'Thumb_Down gesture - Left hand',
      frameIndices: getArrayIndices(thumbDownLeft),
      outputPath:
        'src/core/lib/intent/__fixtures__/gestures/thumb-down-left.ts',
    })
  }

  // Find Thumb_Down frames (right hand)
  const thumbDownRight = filterFrames(session, (frame) => {
    return (
      frame.gestureResult?.hands.some(
        (h) => h.gesture === 'Thumb_Down' && h.handedness === 'Right',
      ) ?? false
    )
  }).slice(0, 10)

  if (thumbDownRight.length > 0) {
    fixtures.push({
      name: 'thumbDownRightFrames',
      description: 'Thumb_Down gesture - Right hand',
      frameIndices: getArrayIndices(thumbDownRight),
      outputPath:
        'src/core/lib/intent/__fixtures__/gestures/thumb-down-right.ts',
    })
  }

  return fixtures
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error(
      'Usage: npx tsx scripts/extract-fixtures.ts <path-to-recording.json>',
    )
    process.exit(1)
  }

  const recordingPath = resolve(process.cwd(), args[0])

  console.log(`\n📂 Loading recording: ${recordingPath}`)

  try {
    const json = readFileSync(recordingPath, 'utf-8')
    const session = loadRecording(json)

    console.log('✅ Recording loaded successfully!\n')

    // Extract pinch fixtures
    console.log('🔍 Extracting pinch fixtures...')
    const pinchFixtures = findPinchFrames(recordingPath)
    console.log(`   Found ${pinchFixtures.length} pinch fixture sets\n`)

    // Extract gesture fixtures
    console.log('🔍 Extracting gesture fixtures...')
    const gestureFixtures = findGestureFixtures(recordingPath)
    console.log(`   Found ${gestureFixtures.length} gesture fixture sets\n`)

    // Combine all fixtures
    const allFixtures = [...pinchFixtures, ...gestureFixtures]

    // Generate and save fixtures
    console.log('💾 Generating fixture files...\n')

    for (const config of allFixtures) {
      const fixtureCode = createTestFixture(
        session,
        config.name,
        config.frameIndices,
      )

      const outputPath = resolve(process.cwd(), config.outputPath)
      const outputDir = dirname(outputPath)

      // Create directory if it doesn't exist
      mkdirSync(outputDir, { recursive: true })

      // Write fixture file
      writeFileSync(outputPath, fixtureCode, 'utf-8')

      console.log(`✅ ${config.name}`)
      console.log(`   ${config.description}`)
      console.log(`   Frames: ${config.frameIndices.length}`)
      console.log(`   Output: ${config.outputPath}`)
      console.log()
    }

    // Generate index file
    const indexPath = resolve(
      process.cwd(),
      'src/core/lib/intent/__fixtures__/index.ts',
    )
    const indexContent = `/**
 * Test Fixtures Index
 * 
 * Auto-generated from recording sessions.
 * Import fixtures for testing gesture matching and contact detection.
 */

// Pinch fixtures
${pinchFixtures.map((f) => `export { ${f.name} } from './${f.outputPath.replace('src/core/lib/intent/__fixtures__/', '').replace('.ts', '')}'`).join('\n')}

// Gesture fixtures
${gestureFixtures.map((f) => `export { ${f.name} } from './${f.outputPath.replace('src/core/lib/intent/__fixtures__/', '').replace('.ts', '')}'`).join('\n')}
`

    writeFileSync(indexPath, indexContent, 'utf-8')
    console.log(`✅ Generated index file: ${indexPath}\n`)

    console.log(`\n✨ Extracted ${allFixtures.length} fixture sets!`)
    console.log(`\n📁 Fixtures saved to: src/core/lib/intent/__fixtures__/\n`)
  } catch (error) {
    console.error(
      '❌ Error:',
      error instanceof Error ? error.message : String(error),
    )
    process.exit(1)
  }
}

main()

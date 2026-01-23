#!/usr/bin/env tsx
/**
 * Unified Fixture Generator
 * 
 * Scans all recordings and generates the BEST fixtures for each type.
 * 
 * Strategy:
 * 1. Scan all recordings (gesture-*.json and contact-*.json)
 * 2. Extract candidate frames for each fixture type
 * 3. Score candidates based on quality metrics
 * 4. Keep only the best fixture for each type
 * 5. Report what was selected and why
 */

import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// Types
// ============================================================================

interface RecordedFrame {
  timestamp: number
  frameIndex: number
  gestureResult: {
    hands: Array<{
      handedness: string
      handIndex: number
      gesture: string
      gestureScore: number
      landmarks: Array<{ x: number; y: number; z: number }>
      worldLandmarks?: Array<{ x: number; y: number; z: number }>
    }>
  }
  performance?: {
    workerFPS: number
    mainFPS: number
  }
}

interface Recording {
  sessionId: string
  description: string
  frames: Array<RecordedFrame>
}

interface FixtureCandidate {
  name: string
  type: 'gesture' | 'contact'
  hand: 'left' | 'right'
  gesture?: string
  finger?: string
  frames: Array<RecordedFrame>
  score: number
  source: string
  reason: string
}

// ============================================================================
// Configuration
// ============================================================================

const RECORDINGS_DIR = path.join(process.cwd(), 'recordings')
const FIXTURES_DIR = path.join(process.cwd(), 'packages/demo/src/core/lib/intent/__fixtures__')

const GESTURE_TYPES = ['Victory', 'Closed_Fist', 'Open_Palm', 'Thumb_Up', 'Thumb_Down', 'None']
const FINGER_TYPES = ['index', 'middle', 'ring', 'pinky']
const HAND_TYPES = ['left', 'right'] as const

const FINGERTIP_INDICES = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
}

// ============================================================================
// Utilities
// ============================================================================

function calculateDistance3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function normalizeHandedness(handedness: string): 'left' | 'right' {
  return handedness.toLowerCase() as 'left' | 'right'
}

/**
 * Round a number to a specific number of decimal places
 * This prevents excessive precision that causes JS precision loss errors
 */
function roundToPrecision(num: number, decimals: number = 8): number {
  const factor = Math.pow(10, decimals)
  return Math.round(num * factor) / factor
}

/**
 * Deep clone and round all numeric values in an object
 * This ensures fixture data has reasonable precision
 */
function roundFramePrecision(frame: RecordedFrame): RecordedFrame {
  return {
    ...frame,
    timestamp: roundToPrecision(frame.timestamp, 3), // milliseconds - 3 decimals enough
    gestureResult: {
      hands: frame.gestureResult.hands.map(hand => ({
        ...hand,
        gestureScore: roundToPrecision(hand.gestureScore, 4), // confidence - 4 decimals
        landmarks: hand.landmarks.map(lm => ({
          x: roundToPrecision(lm.x, 8), // coordinates - 8 decimals (more precision)
          y: roundToPrecision(lm.y, 8),
          z: roundToPrecision(lm.z, 8),
        })),
        // Round worldLandmarks if they exist
        ...(hand.worldLandmarks && {
          worldLandmarks: hand.worldLandmarks.map(wlm => ({
            x: roundToPrecision(wlm.x, 8), // world coordinates - 8 decimals
            y: roundToPrecision(wlm.y, 8),
            z: roundToPrecision(wlm.z, 8),
          })),
        }),
      })),
    },
    // Round performance metrics if they exist
    ...(frame.performance && {
      performance: {
        workerFPS: Math.round(frame.performance.workerFPS), // FPS - integers only
        mainFPS: Math.round(frame.performance.mainFPS),     // FPS - integers only
      },
    }),
  }
}

// ============================================================================
// Frame Analysis
// ============================================================================

function analyzeGestureFrames(frames: Array<RecordedFrame>, gesture: string, hand: 'left' | 'right'): {
  matchingFrames: Array<RecordedFrame>
  avgConfidence: number
  maxConfidence: number
  minConfidence: number
} {
  const matchingFrames = frames.filter(frame => {
    if (!frame.gestureResult || !frame.gestureResult.hands) return false
    
    const matchingHand = frame.gestureResult.hands.find(h => 
      normalizeHandedness(h.handedness) === hand && h.gesture === gesture
    )
    return matchingHand !== undefined
  })

  if (matchingFrames.length === 0) {
    return { matchingFrames: [], avgConfidence: 0, maxConfidence: 0, minConfidence: 0 }
  }

  const confidences = matchingFrames.map(frame => {
    const hand = frame.gestureResult.hands.find(h => h.gesture === gesture)
    return hand?.gestureScore ?? 0
  })

  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length
  const maxConfidence = Math.max(...confidences)
  const minConfidence = Math.min(...confidences)

  return { matchingFrames, avgConfidence, maxConfidence, minConfidence }
}

function analyzeContactFrames(frames: Array<RecordedFrame>, finger: string, hand: 'left' | 'right'): {
  matchingFrames: Array<RecordedFrame>
  avgDistance: number
  minDistance: number
  maxDistance: number
} {
  const fingerIndex = FINGERTIP_INDICES[finger as keyof typeof FINGERTIP_INDICES]
  const thumbIndex = FINGERTIP_INDICES.thumb

  const matchingFrames = frames.filter(frame => {
    if (!frame.gestureResult || !frame.gestureResult.hands) return false
    
    const matchingHand = frame.gestureResult.hands.find(h => 
      normalizeHandedness(h.handedness) === hand
    )
    
    if (!matchingHand || !matchingHand.landmarks || matchingHand.landmarks.length < 21) {
      return false
    }

    const distance = calculateDistance3D(
      matchingHand.landmarks[thumbIndex],
      matchingHand.landmarks[fingerIndex]
    )

    // Consider it a contact if distance < 0.15 (conservative threshold)
    return distance < 0.15
  })

  if (matchingFrames.length === 0) {
    return { matchingFrames: [], avgDistance: 999, minDistance: 999, maxDistance: 999 }
  }

  const distances = matchingFrames.map(frame => {
    const matchedHand = frame.gestureResult.hands.find(h => 
      normalizeHandedness(h.handedness) === hand
    )!
    return calculateDistance3D(
      matchedHand.landmarks[thumbIndex],
      matchedHand.landmarks[fingerIndex]
    )
  })

  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length
  const minDistance = Math.min(...distances)
  const maxDistance = Math.max(...distances)

  return { matchingFrames, avgDistance, minDistance, maxDistance }
}

// ============================================================================
// Fixture Scoring
// ============================================================================

function scoreGestureFixture(
  frames: Array<RecordedFrame>,
  avgConfidence: number,
  maxConfidence: number
): { score: number; reason: string } {
  // Score based on:
  // 1. Number of frames (more is better, up to 10)
  // 2. Average confidence (higher is better)
  // 3. Max confidence (higher is better)
  
  const frameScore = Math.min(frames.length, 10) / 10 // 0-1
  const avgConfScore = avgConfidence // 0-1
  const maxConfScore = maxConfidence // 0-1
  
  const score = (frameScore * 0.3) + (avgConfScore * 0.5) + (maxConfScore * 0.2)
  
  const reason = `${frames.length} frames, avg conf: ${avgConfidence.toFixed(3)}, max conf: ${maxConfidence.toFixed(3)}`
  
  return { score, reason }
}

function scoreContactFixture(
  frames: Array<RecordedFrame>,
  avgDistance: number,
  minDistance: number
): { score: number; reason: string } {
  // Score based on:
  // 1. Number of frames (more is better, up to 10)
  // 2. Average distance (lower is better)
  // 3. Min distance (lower is better)
  
  const frameScore = Math.min(frames.length, 10) / 10 // 0-1
  const avgDistScore = Math.max(0, 1 - (avgDistance / 0.15)) // 0-1 (lower distance = higher score)
  const minDistScore = Math.max(0, 1 - (minDistance / 0.15)) // 0-1
  
  const score = (frameScore * 0.3) + (avgDistScore * 0.5) + (minDistScore * 0.2)
  
  const reason = `${frames.length} frames, avg dist: ${avgDistance.toFixed(4)}, min dist: ${minDistance.toFixed(4)}`
  
  return { score, reason }
}

// ============================================================================
// Fixture Extraction
// ============================================================================

function extractGestureFixtures(recording: Recording, recordingPath: string): Array<FixtureCandidate> {
  const candidates: Array<FixtureCandidate> = []

  for (const gesture of GESTURE_TYPES) {
    for (const hand of HAND_TYPES) {
      const analysis = analyzeGestureFrames(recording.frames, gesture, hand)
      
      if (analysis.matchingFrames.length === 0) continue

      // Take up to 10 best frames
      const selectedFrames = analysis.matchingFrames.slice(0, 10)
      
      const { score, reason } = scoreGestureFixture(
        selectedFrames,
        analysis.avgConfidence,
        analysis.maxConfidence
      )

      const fixtureName = gesture === 'None' 
        ? 'none-gesture'
        : `${gesture.toLowerCase().replace(/_/g, '-')}-${hand}`

      candidates.push({
        name: fixtureName,
        type: 'gesture',
        hand,
        gesture,
        frames: selectedFrames,
        score,
        source: recordingPath,
        reason,
      })
    }
  }

  return candidates
}

function extractContactFixtures(recording: Recording, recordingPath: string): Array<FixtureCandidate> {
  const candidates: Array<FixtureCandidate> = []

  for (const finger of FINGER_TYPES) {
    for (const hand of HAND_TYPES) {
      const analysis = analyzeContactFrames(recording.frames, finger, hand)
      
      if (analysis.matchingFrames.length === 0) continue

      // Take up to 10 best frames (sorted by distance)
      const selectedFrames = analysis.matchingFrames
        .sort((a, b) => {
          const handA = a.gestureResult.hands.find(h => normalizeHandedness(h.handedness) === hand)!
          const handB = b.gestureResult.hands.find(h => normalizeHandedness(h.handedness) === hand)!
          const fingerIndex = FINGERTIP_INDICES[finger as keyof typeof FINGERTIP_INDICES]
          const thumbIndex = FINGERTIP_INDICES.thumb
          const distA = calculateDistance3D(handA.landmarks[thumbIndex], handA.landmarks[fingerIndex])
          const distB = calculateDistance3D(handB.landmarks[thumbIndex], handB.landmarks[fingerIndex])
          return distA - distB // Sort by distance ascending
        })
        .slice(0, 10)
      
      const { score, reason } = scoreContactFixture(
        selectedFrames,
        analysis.avgDistance,
        analysis.minDistance
      )

      const fixtureName = `${hand}-${finger}-pinch`

      candidates.push({
        name: fixtureName,
        type: 'contact',
        hand,
        finger,
        frames: selectedFrames,
        score,
        source: recordingPath,
        reason,
      })
    }
  }

  return candidates
}

// ============================================================================
// Fixture Generation
// ============================================================================

function generateFixtureFile(candidate: FixtureCandidate): string {
  const { name, type, frames, source } = candidate

  // Round all numeric values to prevent precision loss errors
  const roundedFrames = frames.map(roundFramePrecision)

  const header = `// Generated from: ${source}
// Type: ${type}
// Score: ${candidate.score.toFixed(3)} (${candidate.reason})

export const ${toCamelCase(name)}Frames = ${JSON.stringify({
    name: `${toCamelCase(name)}Frames`,
    description: candidate.gesture || `${candidate.finger} pinch`,
    source,
    frameCount: roundedFrames.length,
    frames: roundedFrames,
  }, null, 2)} as const
`

  return header
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🎯 Unified Fixture Generator')
  console.log('=' .repeat(80))

  // Step 1: Scan all recordings
  console.log('\n📂 Scanning recordings...')
  const recordingFiles = fs.readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.json'))
  console.log(`Found ${recordingFiles.length} recordings`)

  // Step 2: Extract all candidates
  console.log('\n🔍 Extracting candidates...')
  const allCandidates: Array<FixtureCandidate> = []

  for (const file of recordingFiles) {
    const filePath = path.join(RECORDINGS_DIR, file)
    const recording: Recording = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    
    console.log(`  Processing: ${file}`)
    
    if (file.startsWith('gesture-')) {
      const gestureCandidates = extractGestureFixtures(recording, file)
      allCandidates.push(...gestureCandidates)
      console.log(`    → Found ${gestureCandidates.length} gesture candidates`)
    } else if (file.startsWith('contact-')) {
      const contactCandidates = extractContactFixtures(recording, file)
      allCandidates.push(...contactCandidates)
      console.log(`    → Found ${contactCandidates.length} contact candidates`)
    }
  }

  console.log(`\nTotal candidates: ${allCandidates.length}`)

  // Step 3: Select best fixture for each type
  console.log('\n🏆 Selecting best fixtures...')
  const bestFixtures = new Map<string, FixtureCandidate>()

  for (const candidate of allCandidates) {
    const existing = bestFixtures.get(candidate.name)
    
    if (!existing || candidate.score > existing.score) {
      bestFixtures.set(candidate.name, candidate)
      
      if (existing) {
        console.log(`  ✨ ${candidate.name}: Upgraded!`)
        console.log(`     Old: ${existing.score.toFixed(3)} (${existing.source})`)
        console.log(`     New: ${candidate.score.toFixed(3)} (${candidate.source})`)
      }
    }
  }

  console.log(`\nSelected ${bestFixtures.size} best fixtures`)

  // Step 4: Generate fixture files
  console.log('\n📝 Generating fixture files...')
  
  // Create directories
  const gesturesDir = path.join(FIXTURES_DIR, 'gestures')
  const pinchDir = path.join(FIXTURES_DIR, 'pinch')
  fs.mkdirSync(gesturesDir, { recursive: true })
  fs.mkdirSync(pinchDir, { recursive: true })

  for (const [name, candidate] of bestFixtures) {
    const dir = candidate.type === 'gesture' ? gesturesDir : pinchDir
    const filePath = path.join(dir, `${name}.ts`)
    const content = generateFixtureFile(candidate)
    
    fs.writeFileSync(filePath, content)
    console.log(`  ✅ ${name}.ts (score: ${candidate.score.toFixed(3)})`)
  }

  // Step 5: Generate index file
  console.log('\n📦 Generating index file...')
  const gestureFixtures = Array.from(bestFixtures.values()).filter(f => f.type === 'gesture')
  const contactFixtures = Array.from(bestFixtures.values()).filter(f => f.type === 'contact')

  const indexContent = `// Auto-generated fixture index
// Generated: ${new Date().toISOString()}

// Gesture fixtures
${gestureFixtures.map(f => `export { ${toCamelCase(f.name)}Frames } from './gestures/${f.name}'`).join('\n')}

// Contact fixtures
${contactFixtures.map(f => `export { ${toCamelCase(f.name)}Frames } from './pinch/${f.name}'`).join('\n')}
`

  fs.writeFileSync(path.join(FIXTURES_DIR, 'index.ts'), indexContent)
  console.log('  ✅ index.ts')

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('✨ Fixture generation complete!')
  console.log(`   Gesture fixtures: ${gestureFixtures.length}`)
  console.log(`   Contact fixtures: ${contactFixtures.length}`)
  console.log(`   Total: ${bestFixtures.size}`)
}

main().catch(console.error)


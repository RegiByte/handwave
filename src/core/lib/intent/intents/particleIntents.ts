/**
 * Particle System Intent Definitions (DSL v2)
 *
 * Clean, declarative intents for manipulating particles through hand gestures.
 * Uses the new fluent DSL - no manual event mapping!
 *
 * Two-Hand Paradigm:
 * - Left hand = MODIFIER (sets color/mode)
 * - Right hand = ACTION (performs the action)
 *
 * Example: Left hand pinch (color modifier) + Right hand pointing up (spawn action)
 * = Spawn colored particles!
 */

import { bidirectional, gestures, intent, pinches } from '@/core/lib/intent/dsl'

// ============================================================================
// TEMPORAL DEFAULTS
// ============================================================================

const defaultDuration = 100 // 100ms to activate
const defaultMaxGap = 200 // 200ms gap tolerance

const intentGroups = {
  spawn: 'spawn', // All spawn intents compete in this group
  vortex: 'vortex',
  repel: 'repel',
}

// ============================================================================
// SPAWN PARTICLES INTENT
// ============================================================================

/**
 * Pointing up gesture spawns particles continuously while held.
 * Particles spawn at the index tip position with random velocity.
 * Works with either hand - the engine creates separate instances per hand.
 * 
 * Priority 0 (default): This is the fallback spawn. If any modifier spawn
 * (pinch + pointing) is active, those will take precedence due to higher priority.
 */
export const spawnParticlesSimple = intent({
  id: 'particles:spawn:simple',
  pattern: gestures.pointingUp.withHand('any').primary(),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { 
    group: intentGroups.spawn,
    priority: 0, // Lowest priority - fallback spawn
  },
})

// ============================================================================
// VORTEX PARTICLES INTENT
// ============================================================================

/**
 * Closed fist creates a black-hole vortex that pulls and swirls particles.
 * Both hands can create vortexes simultaneously - the engine creates separate instances per hand.
 */
export const vortexParticles = intent({
  id: 'particles:vortex',
  pattern: gestures.closedFist.withHand('any').primary(),
  resolution: { group: intentGroups.vortex },
})

// ============================================================================
// REPEL PARTICLES INTENT
// ============================================================================

/**
 * Open palm gesture pushes particles away from hand.
 * Creates a scattering effect with inverse square law.
 * Works with either hand - the engine creates separate instances per hand.
 */
export const repelParticles = intent({
  id: 'particles:repel',
  pattern: gestures.openPalm.withHand('any').withConfidence(0.485).primary(),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
})

// ============================================================================
// CLEAR PARTICLES INTENT
// ============================================================================

/**
 * Thumb up clears all particles after a hold duration.
 * Works with either hand - the engine creates separate instances per hand.
 * Lower confidence threshold (0.5) to handle MediaPipe's flickering detection.
 */
export const clearParticles = intent({
  id: 'particles:clear',
  pattern: gestures.thumbUp.withHand('any').primary(),
  temporal: {
    minDuration: defaultDuration * 15, // 1.5s to clear
    maxGap: defaultMaxGap * 2,
  },
})

// ============================================================================
// PINCH SPAWN INTENTS (Different Colors)
// ============================================================================

// Note: Pinch patterns now use calibrated thresholds by default:
// - index: 0.06 (most reliable)
// - middle: 0.055 (good precision)
// - ring: 0.09 (needs loose threshold due to biomechanics)
// - pinky: 0.075 (limited range of motion)

/**
 * Index pinch spawns blue particles
 */
export const spawnBlueParticlesLeft = intent({
  id: 'particles:spawn:blue:left',
  pattern: pinches.index.withHand('left'),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: 'spawn' },
})

export const spawnBlueParticlesRight = intent({
  id: 'particles:spawn:blue:right',
  pattern: pinches.index.withHand('right'),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: 'spawn' },
})

/**
 * Middle pinch spawns green particles
 */
export const spawnGreenParticlesLeft = intent({
  id: 'particles:spawn:green:left',
  pattern: pinches.middle.withHand('left'),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: 'spawn' },
})

export const spawnGreenParticlesRight = intent({
  id: 'particles:spawn:green:right',
  pattern: pinches.middle.withHand('right'),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: 'spawn' },
})

/**
 * Ring pinch spawns red particles
 */
export const spawnRedParticlesLeft = intent({
  id: 'particles:spawn:red:left',
  pattern: pinches.ring.withHand('left'),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: 'spawn' },
})

export const spawnRedParticlesRight = intent({
  id: 'particles:spawn:red:right',
  pattern: pinches.ring.withHand('right'),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: 'spawn' },
})

/**
 * Pinky pinch spawns yellow particles
 */
export const spawnYellowParticlesLeft = intent({
  id: 'particles:spawn:yellow:left',
  pattern: pinches.pinky.withHand('left'),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: 'spawn' },
})

export const spawnYellowParticlesRight = intent({
  id: 'particles:spawn:yellow:right',
  pattern: pinches.pinky.withHand('right'),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: 'spawn' },
})

// ============================================================================
// TWO-HAND MODIFIER INTENTS (Bidirectional)
// ============================================================================

/**
 * Bidirectional Two-Hand Paradigm for Colored Particle Spawning:
 *
 * MODIFIER HAND - Sets particle color via pinch:
 *   - Index pinch  → Blue
 *   - Middle pinch → Green
 *   - Ring pinch   → Red
 *   - Pinky pinch  → Yellow
 *   - No pinch     → Default white (use simple spawn)
 *
 * ACTION HAND - Pointing up spawns particles
 *
 * Works BOTH ways:
 *   - Left pinch + Right point, OR
 *   - Right pinch + Left point
 *
 * This creates a compositional system where:
 * - You can use either hand for modifier or action (user preference!)
 * - Particles always spawn at the pointing hand's position
 * - You can change colors on the fly without changing the spawn gesture
 * - More intuitive than remembering which hand gesture = which color
 * - Natural for both left-handed and right-handed users
 */

/**
 * Index pinch (modifier hand) + Pointing up (action hand) = Blue particles
 * 
 * Works bidirectionally: left pinch + right point, OR right pinch + left point.
 * Particles spawn at the pointing hand's finger tip (marked as primary).
 * 
 * Priority 10: Higher than simple spawn - this takes precedence when both match.
 */
export const spawnBlueWithModifier = intent({
  id: 'particles:spawn:modified:blue',
  pattern: bidirectional(
    pinches.index,
    gestures.pointingUp
  ),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: intentGroups.spawn, priority: 10 }, // Higher priority than simple spawn
})

/**
 * Middle pinch (modifier hand) + Pointing up (action hand) = Green particles
 * 
 * Works bidirectionally: either hand can be modifier or action.
 * Priority 10: Higher than simple spawn.
 */
export const spawnGreenWithModifier = intent({
  id: 'particles:spawn:modified:green',
  pattern: bidirectional(
    pinches.middle,
    gestures.pointingUp
  ),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: intentGroups.spawn, priority: 10 }, // Higher priority than simple spawn
})

/**
 * Ring pinch (modifier hand) + Pointing up (action hand) = Red particles
 * Also supports Victory gesture as a shortcut for red particles.
 * 
 * Works bidirectionally: either hand can be modifier or action.
 * Victory gesture works with any hand - both hands can make it simultaneously.
 * Priority 10: Higher than simple spawn.
 */
export const spawnRedWithModifier = intent({
  id: 'particles:spawn:modified:red',
  pattern: bidirectional(
    pinches.ring,
    gestures.pointingUp
  ).or(gestures.victory.withHand('any').primary()),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: intentGroups.spawn, priority: 10 }, // Higher priority than simple spawn
})

/**
 * Pinky pinch (modifier hand) + Pointing up (action hand) = Yellow particles
 * 
 * Works bidirectionally: either hand can be modifier or action.
 * Priority 10: Higher than simple spawn.
 */
export const spawnYellowWithModifier = intent({
  id: 'particles:spawn:modified:yellow',
  pattern: bidirectional(
    pinches.pinky,
    gestures.pointingUp
  ),
  temporal: {
    minDuration: defaultDuration,
    maxGap: defaultMaxGap,
  },
  resolution: { group: intentGroups.spawn, priority: 10 }, // Higher priority than simple spawn
})

// ============================================================================
// EXPORT ALL INTENTS
// ============================================================================

export const particleIntentsV2 = [
  // Gesture intents (works with any hand - engine creates per-hand instances)
  vortexParticles,
  repelParticles,
  clearParticles,
  // Two-hand modifier intents (bidirectional - either hand can be modifier/action)
  spawnBlueWithModifier,
  spawnGreenWithModifier,
  spawnRedWithModifier,
  spawnYellowWithModifier,
  // Simple spawn (any hand)
  spawnParticlesSimple,
] as const

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// These types can be used for type-safe event handling
export type SpawnIntentSimple = typeof spawnParticlesSimple
export type VortexIntent = typeof vortexParticles
export type RepelIntent = typeof repelParticles
export type ClearIntent = typeof clearParticles

export type ParticleIntent = (typeof particleIntentsV2)[number]

/**
 * Particle System Render Task
 *
 * Interactive particle system that responds to hand gestures through intent events.
 * Uses Newtonian physics with inverse square law for realistic particle motion.
 *
 * Philosophy: Simple rules compose. Emergence is reliable.
 */

import chroma from 'chroma-js'
import { task } from '@handwave/system'

import type { RenderContext } from './types'
import { mapLandmarkToViewport } from './utils'
import { getFaceOvalIndices } from './face-mesh'
import { hexToRgba } from '@/core/lib/colors'
import type { IntentEngineAPI } from '@/core/lib/intent/resources/intentEngineResource'


// ============================================================================
// Types
// ============================================================================

type Particle = {
  id: string
  x: number // viewport coordinates
  y: number
  vx: number // velocity
  vy: number
  life: number // 0-1 (for future fade effects)
  color: string // hex color
  sourceIntent: string // which intent spawned it
  trail: Array<{ x: number, y: number }> // position history for trails
}

type Force = {
  type: 'vortex' | 'repel' | 'spawn'
  x: number // normalized coordinates
  y: number
  strength: number
  swirlStrength?: number
  killRadius?: number
  boostUntil?: number
  boostMultiplier?: number
  vx?: number
  vy?: number
  burstFrames?: number
  hand?: 'left' | 'right'
  handIndex?: number
  eventType?: string // Store event type for color determination
  isFingerVortex?: boolean // Flag for smaller finger vortex rendering
}

type ParticleState = {
  particles: Array<Particle>
  activeForces: Map<string, Force>
  maxParticles: number
  nextParticleId: number
  rainbowHue: number // 0-360, advances over time for rainbow particles
}

// ============================================================================
// Constants
// ============================================================================

const MAX_PARTICLES = 1800
const SPAWN_RATE = 3 // particles per frame
const PARTICLE_RADIUS = 3
const GLOW_RADIUS = 6
const DAMPING = 0.995 // velocity damping (higher = less damping, more movement)

// Force strengths
const VORTEX_STRENGTH = 300000
// const VORTEX_STRENGTH = 280000
// const VORTEX_SWIRL_STRENGTH = 1100
const VORTEX_SWIRL_STRENGTH = VORTEX_STRENGTH * 0.002
const VORTEX_KILL_RADIUS = 60
const VORTEX_RING_RADIUS = 200
const VORTEX_CORE_RADIUS = 60

// Finger vortex (smaller, more localized)
const FINGER_VORTEX_STRENGTH = VORTEX_STRENGTH * 0.4 // 40% of hand vortex
const FINGER_VORTEX_SWIRL_STRENGTH = FINGER_VORTEX_STRENGTH * 0.002
const FINGER_VORTEX_KILL_RADIUS = 20 // Much smaller kill radius
const FINGER_VORTEX_RING_RADIUS = 80 // Smaller effect radius
const FINGER_VORTEX_CORE_RADIUS = 25

const REPEL_STRENGTH = VORTEX_STRENGTH * 1.2
const REPEL_SWIRL_STRENGTH = VORTEX_STRENGTH * 0.003
const REPEL_BOOST_MULTIPLIER = 2.5
const REPEL_BOOST_DURATION = 4000 // ms


const SPAWN_VELOCITY = 1.31415 // Higher initial velocity
const SPAWN_VELOCITY_BIAS = 42
const SPAWN_BURST_FRAMES = 3
const SPAWN_BURST_RATE = 100
const TRAIL_LENGTH = 2 // Number of historical positions to keep (motion blur effect)

// Colors by intent type
const COLORS = {
  spawn: '#00FF88', // green
  vortex: '#9B5CFF', // purple
  repel: '#FF6B6B', // red
  default: '#FFFFFF', // white
  blue: '#4A90E2', // blue
  green: '#7ED321', // green
  red: '#D0021B', // red
  yellow: '#F5A623', // yellow
}

// ============================================================================
// Physics Functions
// ============================================================================

/**
 * Apply a vortex force: radial attraction + tangential swirl.
 * Returns true if particle should be deleted (fell into the core).
 * Uses direct distance (no toroidal wrapping) for localized effect.
 */
function applyVortexForce(
  particle: Particle,
  force: Force,
  deltaMs: number,
  forceX: number,
  forceY: number,
  _width: number,
  _height: number
): boolean {
  // Use direct distance calculation
  const dx = particle.x - forceX
  const dy = particle.y - forceY
  const distSq = dx * dx + dy * dy
  const dist = Math.sqrt(distSq)

  if (dist < (force.killRadius ?? VORTEX_KILL_RADIUS)) {
    return true
  }

  const minDist = 8
  const safeDist = Math.max(dist, minDist)

  const radialMag =
    force.strength / (safeDist * safeDist) + (force.strength * 0.003) / safeDist
  const swirlMag = (force.swirlStrength ?? VORTEX_SWIRL_STRENGTH) / safeDist

  const radialFx = (dx / safeDist) * radialMag * -1
  const radialFy = (dy / safeDist) * radialMag * -1

  const tx = -dy / safeDist
  const ty = dx / safeDist

  const swirlFx = tx * swirlMag
  const swirlFy = ty * swirlMag

  const dt = deltaMs / 1000
  particle.vx += (radialFx + swirlFx) * dt
  particle.vy += (radialFy + swirlFy) * dt

  return false
}

/**
 * Apply a repel swirl: radial repulsion + tangential swirl.
 * Uses direct distance (no toroidal wrapping) for localized effect.
 */
function applyRepelSwirlForce(
  particle: Particle,
  force: Force,
  deltaMs: number,
  forceX: number,
  forceY: number,
  strengthOverride: number,
  _width: number,
  _height: number
): void {
  // Use direct distance calculation
  const dx = particle.x - forceX
  const dy = particle.y - forceY
  const distSq = dx * dx + dy * dy
  const dist = Math.sqrt(distSq)

  const minDist = 8
  const safeDist = Math.max(dist, minDist)

  const strength = strengthOverride
  const radialMag = strength / (safeDist * safeDist)
  const swirlMag = (force.swirlStrength ?? REPEL_SWIRL_STRENGTH) / safeDist

  const radialFx = (dx / safeDist) * radialMag
  const radialFy = (dy / safeDist) * radialMag

  const tx = -dy / safeDist
  const ty = dx / safeDist

  const swirlFx = tx * swirlMag
  const swirlFy = ty * swirlMag

  const dt = deltaMs / 1000
  particle.vx += (radialFx + swirlFx) * dt
  particle.vy += (radialFy + swirlFy) * dt
}

/**
 * Simple gradient noise approximation using layered sine waves
 * Creates organic flow patterns without external dependencies
 * 
 * Parameters you can tune:
 * - First number in each octave (0.008, 0.015, 0.006) = frequency/zoom
 *   Smaller = larger patterns, Larger = tighter spirals
 * - Time multipliers (0.00008, 0.00012) = animation speed
 */
function simpleNoise(x: number, y: number, t: number): number {
  // Multiple octaves for richer patterns
  const bases = {
    octave1: 0.0021618033,
    octave2: 0.0023236066,
  }
  const animationSpeeds = {
    octave1Sin: 0.0001,
    octave1Cos: 0.0002,
  }
  const octave2 = Math.sin(x * bases.octave1 + t * animationSpeeds.octave1Sin) * Math.cos(y * bases.octave1 + t * animationSpeeds.octave1Cos) * 0.5
  const octave3 = Math.sin((x + y) * bases.octave2) * 0.3

  // return octave1 + octave2 + octave3
  return octave2 + octave3
}

/**
 * Apply flow field force using Perlin-style noise
 * Creates organic, swirling patterns for ambient particle motion
 */
function applyFlowFieldForce(
  particle: Particle,
  timestamp: number,
  deltaMs: number
): void {
  const angle = simpleNoise(particle.x, particle.y, timestamp) * Math.PI * 2
  const strength = 0.131415 // Gentle background influence

  const dt = deltaMs / 1000
  particle.vx += Math.cos(angle) * strength * dt
  particle.vy += Math.sin(angle) * strength * dt
}


/**
 * Update particle position and handle boundaries
 */
function updateParticle(
  particle: Particle,
  width: number,
  height: number,
  deltaMs: number
): void {
  const dt = deltaMs / 1000

  // Store current position before updating (for trails)
  if (deltaMs * 1000 % 4 === 0) {
    particle.trail.push({ x: particle.x, y: particle.y })
  }
  if (particle.trail.length > TRAIL_LENGTH) {
    particle.trail.shift() // Remove oldest position
  }

  // Update position
  particle.x += particle.vx * dt * 60 // Scale by 60 for consistent speed at 60fps
  particle.y += particle.vy * dt * 60

  // Apply damping
  particle.vx *= DAMPING
  particle.vy *= DAMPING

  // Toroidal wrap around viewport bounds
  if (particle.x < 0) {
    particle.x += width
  } else if (particle.x > width) {
    particle.x -= width
  }

  if (particle.y < 0) {
    particle.y += height
  } else if (particle.y > height) {
    particle.y -= height
  }
}

/**
 * Get rainbow color from hue rotation (0-360)
 * Creates smooth color spectrum for rainbow particles
 */
function getRainbowColor(hue: number): string {
  return chroma.hsl(hue, 0.8, 0.6).hex()
}

/**
 * Get particle color based on event type.
 * 
 * Supports both patterns:
 * - Simple spawn: 'particles:spawn:simple' → rainbow color
 * - Single-hand: 'particles:spawn:blue:left' (has :blue:)
 * - Two-hand modifier: 'particles:spawn:modified:blue' (ends with :blue)
 */
function getParticleColor(eventType: string, rainbowHue: number): string {
  // Check for simple spawn - use rainbow
  if (eventType.includes(':simple')) return getRainbowColor(rainbowHue)
  // Check for color anywhere in the string (handles both patterns)
  if (eventType.includes(':blue')) return COLORS.blue
  if (eventType.includes(':green')) return COLORS.green
  if (eventType.includes(':red')) return COLORS.red
  if (eventType.includes(':yellow')) return COLORS.yellow
  return COLORS.spawn // default white/green
}

function spawnParticle(
  state: ParticleState,
  x: number,
  y: number,
  sourceIntent: string,
  velocityBias?: { x: number; y: number },
  velocityScale = 1,
  color?: string
): void {
  // Enforce max particle count
  if (state.particles.length >= state.maxParticles) {
    // Remove oldest particle
    state.particles.shift()
  }

  // Random angle for spawn velocity
  const angle = Math.random() * Math.PI * 2
  const speed = SPAWN_VELOCITY * (0.5 + Math.random() * 0.5) * velocityScale
  const biasX = (velocityBias?.x ?? 0) * SPAWN_VELOCITY_BIAS
  const biasY = (velocityBias?.y ?? 0) * SPAWN_VELOCITY_BIAS

  const particle: Particle = {
    id: `particle_${state.nextParticleId++}`,
    x,
    y,
    vx: Math.cos(angle) * speed + biasX,
    vy: Math.sin(angle) * speed + biasY,
    life: 1.0,
    color: color ?? COLORS.spawn,
    sourceIntent,
    trail: [{ x, y }], // Initialize with spawn position
  }

  state.particles.push(particle)
}

/**
 * Render a particle with glow effect and motion blur trail
 * Uses smaller ghost particles to create motion blur effect
 */
function renderParticle(
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  width: number,
  height: number
): void {
  // Draw trail as fading ghost particles (motion blur effect)
  if (particle.trail.length > 1) {
    for (let i = 0; i < particle.trail.length - 1; i++) {
      const pos = particle.trail[i]

      // Check if this position involves a wrap - skip if so
      if (i > 0) {
        const prevPos = particle.trail[i - 1]
        const dx = Math.abs(pos.x - prevPos.x)
        const dy = Math.abs(pos.y - prevPos.y)

        // If jump is more than half the viewport, particle wrapped - skip this trail point
        if (dx > width / 2 || dy > height / 2) {
          continue
        }
      }

      // Calculate fade based on position in trail (older = more transparent)
      const age = i / (particle.trail.length - 1)
      const alpha = age * 0.4 // Max 40% opacity for oldest, fades to 0
      const sizeMultiplier = 0.8 + age * 0.8 // Smaller particles for older positions

      // Draw ghost particle
      const ghostRadius = PARTICLE_RADIUS * sizeMultiplier
      ctx.fillStyle = hexToRgba(particle.color, alpha)
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, ghostRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Draw outer glow
  ctx.fillStyle = hexToRgba(particle.color, 0.2)
  ctx.beginPath()
  ctx.arc(particle.x, particle.y, GLOW_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  // Draw main particle
  ctx.fillStyle = particle.color
  ctx.beginPath()
  ctx.arc(particle.x, particle.y, PARTICLE_RADIUS, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Render black-hole style vortex overlay.
 */
function renderVortexOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timestamp: number
): void {
  const pulse = 0.85 + Math.sin(timestamp * 0.006) * 0.1
  const ringRadius = VORTEX_RING_RADIUS * pulse

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'

  // Dark core
  ctx.fillStyle = 'rgba(91, 33, 182, 1)'
  ctx.beginPath()
  ctx.arc(x, y, VORTEX_CORE_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  // Outer ring
  ctx.strokeStyle = 'rgba(112, 8.01, 231, 1)'
  ctx.fillStyle = 'rgba(29.9, 26.2, 76.7, 0.25)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Spiral hint
  ctx.strokeStyle = 'rgba(79.3, 57.2, 246, 1)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 20; i++) {
    const t = i / 20
    const angle = t * Math.PI * 4 + timestamp * 0.002
    const radius = t * ringRadius
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()

  ctx.restore()
}

/**
 * Render smaller finger vortex overlay.
 * More compact and precise for finger-tip control.
 */
function renderFingerVortexOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timestamp: number
): void {
  const pulse = 0.85 + Math.sin(timestamp * 0.007) * 0.15
  const ringRadius = FINGER_VORTEX_RING_RADIUS * pulse

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'

  // Smaller core with cyan tint
  ctx.fillStyle = 'rgba(33, 182, 168, 1)'
  ctx.beginPath()
  ctx.arc(x, y, FINGER_VORTEX_CORE_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  // Outer ring with cyan glow
  ctx.strokeStyle = 'rgba(8, 231, 204, 1)'
  ctx.fillStyle = 'rgba(26.2, 76.7, 72, 0.3)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Tighter spiral
  ctx.strokeStyle = 'rgba(57, 246, 220, 0.8)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 15; i++) {
    const t = i / 15
    const angle = t * Math.PI * 3 + timestamp * 0.003
    const radius = t * ringRadius
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()

  ctx.restore()
}

function renderForceTarget(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius = 22
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/**
 * Render flow field visualization
 * Shows arrow vectors at grid points indicating the direction and strength of the flow
 */
function renderFlowField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timestamp: number,
  gridSpacing = 40 // Distance between visualization points
): void {
  ctx.save()

  // Draw arrows at grid points
  for (let x = gridSpacing; x < width; x += gridSpacing) {
    for (let y = gridSpacing; y < height; y += gridSpacing) {
      // Calculate flow direction at this point
      const angle = simpleNoise(x, y, timestamp) * Math.PI * 2
      const strength = 1.2 // Same as applyFlowFieldForce

      // Arrow length based on strength
      const arrowLength = strength * 15
      const endX = x + Math.cos(angle) * arrowLength
      const endY = y + Math.sin(angle) * arrowLength

      // Draw arrow line
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(endX, endY)
      ctx.stroke()

      // Draw arrowhead
      const headLength = 5
      const headAngle = Math.PI / 6 // 30 degrees

      ctx.beginPath()
      ctx.moveTo(endX, endY)
      ctx.lineTo(
        endX - headLength * Math.cos(angle - headAngle),
        endY - headLength * Math.sin(angle - headAngle)
      )
      ctx.moveTo(endX, endY)
      ctx.lineTo(
        endX - headLength * Math.cos(angle + headAngle),
        endY - headLength * Math.sin(angle + headAngle)
      )
      ctx.stroke()
    }
  }

  ctx.restore()
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the index finger tip position from gesture result for a specific hand.
 * Used for finger vortex to get the pointing position.
 * 
 * MediaPipe GestureRecognizerResult has parallel arrays:
 * - landmarks: Array<Array<Landmark>> - one array per hand
 * - handednesses: Array<{ categories: Array<Category> }> - handedness for each hand
 * - gestures: Array<{ categories: Array<Category> }> - gestures for each hand
 */
function getIndexFingerTipPosition(
  gestureResult: any, // GestureRecognizerResult from MediaPipe
  hand: 'left' | 'right',
  handIndex: number
): { x: number; y: number } | null {
  if (!gestureResult?.landmarks || !gestureResult?.handednesses) return null

  // MediaPipe returns parallel arrays - match by handedness and array index
  for (let i = 0; i < gestureResult.landmarks.length; i++) {
    const handednessInfo = gestureResult.handednesses[i]
    if (!handednessInfo?.categories?.[0]) continue

    // Extract categoryName from the first category ("Left" or "Right")
    const handednessLabel = handednessInfo.categories[0].categoryName?.toLowerCase()

    // Match by handedness and index in the array
    if (handednessLabel === hand && i === handIndex) {
      const landmarks = gestureResult.landmarks[i]
      if (!landmarks?.[8]) continue

      // Index finger tip is landmark 8
      const indexTip = landmarks[8]
      return {
        x: indexTip.x,
        y: indexTip.y,
      }
    }
  }

  return null
}

// ============================================================================
// Task Factory
// ============================================================================

/**
 * Create particle system render task
 *
 * Subscribes to particle intent events and renders interactive particles.
 * Uses task pipeline lifecycle for proper event cleanup.
 */
export const createParticlesTask = (
  intentEngine: IntentEngineAPI
) => task<RenderContext, void>(() => {
  // Initialize state (encapsulated in closure)
  const state: ParticleState = {
    particles: [],
    activeForces: new Map(),
    maxParticles: MAX_PARTICLES,
    nextParticleId: 0,
    rainbowHue: 0,
  }

  // Flow field visualization toggle
  let showFlowField = false

  // Keyboard listener for toggling flow field visualization
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'f' || e.key === 'F') {
      showFlowField = !showFlowField
      console.log(`[particles] Flow field visualization: ${showFlowField ? 'ON' : 'OFF'}`)
    }
  }

  // Store latest gesture result for event handlers to access
  let latestGestureResult: any = null
  
  // Spawn initial particles flag
  let initialized = false

  // Track active face outline spawn
  let faceOutlineSpawnActive = false

  // ========================================================================
  // Lifecycle: Init - Subscribe to events
  // ========================================================================

  return {
    init: () => {
      // Add keyboard listener
      window.addEventListener('keydown', handleKeyPress)

      // Event format is now: {intentId}:{phase} e.g., "particles:vortex:start"
      // Hand information is in the event payload: event.hand, event.handIndex, event.headIndex
      // NOTE: After per-hand instances refactoring, hand is metadata not part of event type
      const onIntent = (
        intentId: string,
        phase: string,
        handler: (event: any) => void
      ) => {
        intentEngine.on(`${intentId}:${phase}`, handler)
      }

  // Spawn particles intent (simple spawn - any hand)
  onIntent('particles:spawn:simple', 'start', (event: any) => {
    // console.log('[particles] Spawn start event received:', event.type, 'hand:', event.hand, 'handIndex:', event.handIndex)
    state.activeForces.set(event.id, {
      type: 'spawn',
      x: 0, // will be updated in onUpdate
      y: 0,
      strength: 0,
      burstFrames: SPAWN_BURST_FRAMES,
      hand: event.hand,
      handIndex: event.handIndex,
      eventType: event.type,
    })
  })

  onIntent('particles:spawn:simple', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      // Update force position (will be used for spawning)
      force.x = event.position.x
      force.y = event.position.y
      force.vx = event.velocity?.x ?? 0
      force.vy = event.velocity?.y ?? 0
    }
  })

  onIntent('particles:spawn:simple', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  // Colored pinch spawn intents (per-hand)
  onIntent('particles:spawn:blue:left', 'start', (event: any) => {
    state.activeForces.set(event.id, {
      type: 'spawn',
      x: 0,
      y: 0,
      strength: 0,
      burstFrames: SPAWN_BURST_FRAMES,
      hand: event.hand,
      handIndex: event.handIndex,
      eventType: event.type,
    })
  })

  onIntent('particles:spawn:blue:left', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
      force.vx = event.velocity?.x ?? 0
      force.vy = event.velocity?.y ?? 0
    }
  })

  onIntent('particles:spawn:blue:left', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  onIntent('particles:spawn:blue:right', 'start', (event: any) => {
    state.activeForces.set(event.id, {
      type: 'spawn',
      x: 0,
      y: 0,
      strength: 0,
      burstFrames: SPAWN_BURST_FRAMES,
      hand: event.hand,
      handIndex: event.handIndex,
      eventType: event.type,
    })
  })

  onIntent('particles:spawn:blue:right', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
      force.vx = event.velocity?.x ?? 0
      force.vy = event.velocity?.y ?? 0
    }
  })

  onIntent('particles:spawn:blue:right', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  onIntent('particles:spawn:green:left', 'start', (event: any) => {
    state.activeForces.set(event.id, {
      type: 'spawn',
      x: 0,
      y: 0,
      strength: 0,
      burstFrames: SPAWN_BURST_FRAMES,
      hand: event.hand,
      handIndex: event.handIndex,
      eventType: event.type,
    })
  })

  onIntent('particles:spawn:green:left', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
      force.vx = event.velocity?.x ?? 0
      force.vy = event.velocity?.y ?? 0
    }
  })

  onIntent('particles:spawn:green:left', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  onIntent('particles:spawn:green:right', 'start', (event: any) => {
    state.activeForces.set(event.id, {
      type: 'spawn',
      x: 0,
      y: 0,
      strength: 0,
      burstFrames: SPAWN_BURST_FRAMES,
      hand: event.hand,
      handIndex: event.handIndex,
      eventType: event.type,
    })
  })

  onIntent('particles:spawn:green:right', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
      force.vx = event.velocity?.x ?? 0
      force.vy = event.velocity?.y ?? 0
    }
  })

  onIntent('particles:spawn:green:right', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  onIntent('particles:spawn:red:left', 'start', (event: any) => {
    state.activeForces.set(event.id, {
      type: 'spawn',
      x: 0,
      y: 0,
      strength: 0,
      burstFrames: SPAWN_BURST_FRAMES,
      hand: event.hand,
      handIndex: event.handIndex,
      eventType: event.type,
    })
  })

  onIntent('particles:spawn:red:left', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
      force.vx = event.velocity?.x ?? 0
      force.vy = event.velocity?.y ?? 0
    }
  })

  onIntent('particles:spawn:red:left', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  onIntent('particles:spawn:red:right', 'start', (event: any) => {
    state.activeForces.set(event.id, {
      type: 'spawn',
      x: 0,
      y: 0,
      strength: 0,
      burstFrames: SPAWN_BURST_FRAMES,
      hand: event.hand,
      handIndex: event.handIndex,
      eventType: event.type,
    })
  })

  onIntent('particles:spawn:red:right', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
      force.vx = event.velocity?.x ?? 0
      force.vy = event.velocity?.y ?? 0
    }
  })

  onIntent('particles:spawn:red:right', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  onIntent('particles:spawn:yellow:left', 'start', (event: any) => {
    state.activeForces.set(event.id, {
      type: 'spawn',
      x: 0,
      y: 0,
      strength: 0,
      burstFrames: SPAWN_BURST_FRAMES,
      hand: event.hand,
      handIndex: event.handIndex,
      eventType: event.type,
    })
  })

  onIntent('particles:spawn:yellow:left', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
      force.vx = event.velocity?.x ?? 0
      force.vy = event.velocity?.y ?? 0
    }
  })

  onIntent('particles:spawn:yellow:left', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  onIntent('particles:spawn:yellow:right', 'start', (event: any) => {
    state.activeForces.set(event.id, {
      type: 'spawn',
      x: 0,
      y: 0,
      strength: 0,
      burstFrames: SPAWN_BURST_FRAMES,
      hand: event.hand,
      handIndex: event.handIndex,
      eventType: event.type,
    })
  })

  onIntent('particles:spawn:yellow:right', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
      force.vx = event.velocity?.x ?? 0
      force.vy = event.velocity?.y ?? 0
    }
  })

  onIntent('particles:spawn:yellow:right', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  // ========================================================================
  // Two-hand modifier spawn intents (left modifier + right action)
  // ========================================================================

  // Helper to register modifier spawn intents
  // These use the right hand position for spawning (action hand)
  // Note: Two-hand intents don't have :left/:right suffix since they require BOTH hands
  const registerModifierSpawn = (color: string) => {
    const baseId = `particles:spawn:modified:${color}`

    intentEngine.on(`${baseId}:start`, (event) => {
      state.activeForces.set(event.id, {
        type: 'spawn',
        x: 0,
        y: 0,
        strength: 0,
        vx: 0,
        vy: 0,
        burstFrames: SPAWN_BURST_FRAMES,
        eventType: baseId,
      })
    })

    intentEngine.on(`${baseId}:update`, (event: any) => {
      const force = state.activeForces.get(event.id)
      if (force) {
        // console.log(`[particles] ${baseId} update - position:`, event.position)
        force.x = event.position.x
        force.y = event.position.y
        force.vx = event.velocity?.x ?? 0
        force.vy = event.velocity?.y ?? 0
      }
    })

    intentEngine.on(`${baseId}:end`, (event: any) => {
      state.activeForces.delete(event.id)
    })
  }

  // Register all modifier spawn intents
  registerModifierSpawn('blue')
  registerModifierSpawn('green')
  registerModifierSpawn('red') // Includes victory gesture
  registerModifierSpawn('yellow')

  // Vortex particles intent (supports both hands independently)
  onIntent('particles:vortex', 'start', (event: any) => {
    // console.log('[particles] Vortex start event received:', event.type, 'hand:', event.hand, 'handIndex:', event.handIndex)
    state.activeForces.set(event.id, {
      type: 'vortex',
      x: event.position.x,
      y: event.position.y,
      strength: VORTEX_STRENGTH,
      swirlStrength: VORTEX_SWIRL_STRENGTH,
      killRadius: VORTEX_KILL_RADIUS,
      hand: event.hand,
      handIndex: event.handIndex,
    })
  })

  onIntent('particles:vortex', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
    }
  })

  onIntent('particles:vortex', 'end', (event: any) => {
    // console.log('[particles] Vortex end event received:', event.id)
    state.activeForces.delete(event.id)
  })

  // Finger vortex intent (smaller, localized vortex at index finger tip)
  onIntent('particles:vortex:finger', 'start', (event: any) => {
    // Extract index finger tip position from the same hand that's pinching
    const fingerPos = getIndexFingerTipPosition(latestGestureResult, event.hand, event.handIndex)

    if (!fingerPos) {
      return
    }
    state.activeForces.set(event.id, {
      type: 'vortex',
      x: fingerPos.x,
      y: fingerPos.y,
      strength: FINGER_VORTEX_STRENGTH,
      swirlStrength: FINGER_VORTEX_SWIRL_STRENGTH,
      killRadius: FINGER_VORTEX_KILL_RADIUS,
      hand: event.hand,
      handIndex: event.handIndex,
      isFingerVortex: true,
    })
  })

  onIntent('particles:vortex:finger', 'update', (event) => {
    const force = state.activeForces.get(event.id)
    if (!force) return

    // Update position to track index finger tip, not pinch midpoint
    const fingerPos = getIndexFingerTipPosition(latestGestureResult, event.hand, event.handIndex)
    if (fingerPos) {
      force.x = fingerPos.x
      force.y = fingerPos.y
    }
  })

  onIntent('particles:vortex:finger', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  // Repel particles intent (supports both hands independently)
  onIntent('particles:repel', 'start', (event: any) => {
    // console.log('[particles] Repel start event received:', event.type, 'hand:', event.hand, 'handIndex:', event.handIndex)
    state.activeForces.set(event.id, {
      type: 'repel',
      x: event.position.x,
      y: event.position.y,
      strength: REPEL_STRENGTH,
      boostUntil: event.timestamp + REPEL_BOOST_DURATION,
      boostMultiplier: REPEL_BOOST_MULTIPLIER,
      swirlStrength: REPEL_SWIRL_STRENGTH,
      hand: event.hand,
      handIndex: event.handIndex,
    })
  })

  onIntent('particles:repel', 'update', (event: any) => {
    const force = state.activeForces.get(event.id)
    if (force) {
      force.x = event.position.x
      force.y = event.position.y
    }
  })

  onIntent('particles:repel', 'end', (event: any) => {
    state.activeForces.delete(event.id)
  })

  // Clear particles intent (any hand can trigger)
  onIntent('particles:clear', 'start', (_event: any) => {
    // Clear all particles immediately
    state.particles = []
  })

  // Face outline spawn intent (both hands victory)
  onIntent('particles:spawn:face-outline', 'start', (_event: any) => {
    faceOutlineSpawnActive = true
  })

  onIntent('particles:spawn:face-outline', 'update', (_event: any) => {
    faceOutlineSpawnActive = true
  })

  onIntent('particles:spawn:face-outline', 'end', (_event: any) => {
    faceOutlineSpawnActive = false
  })
    },

    // ========================================================================
    // Lifecycle: Execute - Render particles every frame
    // ========================================================================

    execute: ({ ctx, width, height, deltaMs, mirrored, timestamp, paused, faceResult, gestureResult, viewport }) => {
    // Update the latest gesture result for event handlers
    latestGestureResult = gestureResult
    // Initialize particles on first render
    if (!initialized && width > 0 && height > 0) {
      initialized = true
      // Spawn 100 initial particles spread across screen
      for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = SPAWN_VELOCITY * (0.3 + Math.random() * 0.7)
        const x = Math.random() * width
        const y = Math.random() * height
        const particle: Particle = {
          id: `particle_${state.nextParticleId++}`,
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          color: COLORS.default,
          sourceIntent: 'initial',
          trail: [{ x, y }], // Initialize with spawn position
        }
        state.particles.push(particle)
      }
    }

    // Skip if paused or no delta time
    if (deltaMs <= 0) return

    // Update rainbow hue for color rotation
    if (!paused) {
      state.rainbowHue = (state.rainbowHue + deltaMs * 0.05) % 360
    }

    // ======================================================================
    // Spawn particles from active spawn forces
    // ======================================================================

    state.activeForces.forEach((force) => {
      if (force.type === 'spawn' && !paused) {
        // Use the position from the force, which is already calculated
        // correctly based on the gesture/pinch type (e.g., fingertip for pinch)
        const spawnTarget = { x: force.x, y: force.y }

        // Convert normalized coordinates to viewport
        // Handle mirroring: if mirrored, flip X coordinate
        let spawnX = spawnTarget.x * width
        const spawnY = spawnTarget.y * height

        if (mirrored) {
          spawnX = width - spawnX
        }

        const velocityBias = {
          x: force.vx ?? 0,
          y: force.vy ?? 0,
        }

        // Determine particle color from event type (pass rainbow hue for simple spawn)
        const particleColor = getParticleColor(force.eventType ?? 'particles:spawn', state.rainbowHue)

        // Spawn multiple particles per frame
        for (let i = 0; i < SPAWN_RATE; i++) {
          spawnParticle(state, spawnX, spawnY, 'particles:spawn', velocityBias, 1, particleColor)
        }

        if ((force.burstFrames ?? 0) > 0) {
          for (let i = 0; i < SPAWN_BURST_RATE; i++) {
            spawnParticle(
              state,
              spawnX,
              spawnY,
              'particles:spawn',
              velocityBias,
              1.5,
              particleColor
            )
          }
          force.burstFrames = (force.burstFrames ?? 1) - 1
        }
      }
    })

    // ======================================================================
    // Collect face outline segments for particle spawning
    // ======================================================================

    // Collect face oval outline segments for particle spawning
    const faceOvalSegments: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> = []
    if (faceResult?.faceLandmarks?.length) {
      const ovalIndices = getFaceOvalIndices()

      for (const landmarks of faceResult.faceLandmarks) {
        // Build ordered list of face oval landmarks
        const ovalPoints = ovalIndices.map(idx => {
          const landmark = landmarks[idx]
          return mapLandmarkToViewport(landmark, viewport, mirrored)
        })

        // Create segments connecting consecutive oval points
        for (let i = 0; i < ovalPoints.length; i++) {
          const start = ovalPoints[i]
          const end = ovalPoints[(i + 1) % ovalPoints.length] // Wrap around to close the loop
          faceOvalSegments.push({ start, end })
        }
      }
    }

    // ======================================================================
    // Spawn particles from face outline (when both hands show victory)
    // ======================================================================

    if (faceOutlineSpawnActive && !paused && faceOvalSegments.length > 0) {
      // Spawn particles from random points along face outline segments
      // Use fewer spawns per frame to avoid overwhelming the system
      const segmentsToSpawn = Math.min(3, faceOvalSegments.length) // Spawn from 3 random segments

      for (let i = 0; i < segmentsToSpawn; i++) {
        // Pick a random segment
        const segment = faceOvalSegments[Math.floor(Math.random() * faceOvalSegments.length)]

        // Pick a random point along the segment
        const t = Math.random() // 0 to 1 along segment
        const spawnX = segment.start.x + (segment.end.x - segment.start.x) * t
        const spawnY = segment.start.y + (segment.end.y - segment.start.y) * t

        // Calculate outward normal direction from face center
        // Estimate face center as midpoint of all segments
        const faceCenterX = faceOvalSegments.reduce((sum, seg) =>
          sum + (seg.start.x + seg.end.x) / 2, 0) / faceOvalSegments.length
        const faceCenterY = faceOvalSegments.reduce((sum, seg) =>
          sum + (seg.start.y + seg.end.y) / 2, 0) / faceOvalSegments.length

        // Direction from center to spawn point (outward)
        const dx = spawnX - faceCenterX
        const dy = spawnY - faceCenterY
        const dist = Math.sqrt(dx * dx + dy * dy)

        // Normalized outward direction
        const outwardX = dist > 0 ? dx / dist : 0
        const outwardY = dist > 0 ? dy / dist : 0

        // Spawn particles with outward velocity bias
        const velocityBias = {
          x: outwardX * 0.3, // Gentle outward push
          y: outwardY * 0.3,
        }

        // Use rainbow colors for face outline particles
        const particleColor = getRainbowColor(state.rainbowHue)

        // Spawn 2 particles per segment
        for (let j = 0; j < 2; j++) {
          spawnParticle(state, spawnX, spawnY, 'particles:spawn:face-outline', velocityBias, 1, particleColor)
        }
      }
    }

    // ======================================================================
    // Update physics for all particles
    // ======================================================================

    const resolvedForces = Array.from(state.activeForces.values())
      .filter((force) => force.type !== 'spawn')
      .map((force) => {
        const target = { x: force.x, y: force.y }

        let forceX = target.x * width
        const forceY = target.y * height

        if (mirrored) {
          forceX = width - forceX
        }

        const boostedStrength =
          force.boostUntil && force.boostMultiplier && timestamp < force.boostUntil
            ? force.strength * force.boostMultiplier
            : force.strength

        return {
          force,
          forceX,
          forceY,
          boostedStrength,
        }
      })

    if (!paused) {
      // Update all particles
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const particle = state.particles[i]
        let shouldDelete = false

        // Apply flow field force for organic particle motion
        applyFlowFieldForce(particle, timestamp, deltaMs)

        // Apply forces from all active force fields (hands)
        for (const entry of resolvedForces) {
          const { force, forceX, forceY, boostedStrength } = entry

          if (force.type === 'vortex') {
            const dead = applyVortexForce(particle, force, deltaMs, forceX, forceY, width, height)
            if (dead) shouldDelete = true
            continue
          }

          applyRepelSwirlForce(
            particle,
            force,
            deltaMs,
            forceX,
            forceY,
            boostedStrength,
            width,
            height
          )
        }

        if (shouldDelete) {
          state.particles.splice(i, 1)
          continue
        }

        // Update position and handle boundaries
        updateParticle(particle, width, height, deltaMs)
      }
    }

    // ======================================================================
    // Render all particles
    // ======================================================================

    state.particles.forEach((particle) => {
      renderParticle(ctx, particle, width, height)
    })

    for (const entry of resolvedForces) {
      const { force, forceX, forceY } = entry
      if (force.type === 'vortex') {
        if (force.isFingerVortex) {
          renderFingerVortexOverlay(ctx, forceX, forceY, timestamp)
          renderForceTarget(ctx, forceX, forceY, 'rgba(8, 231, 204, 0.8)', 18)
        } else {
          renderVortexOverlay(ctx, forceX, forceY, timestamp)
          renderForceTarget(ctx, forceX, forceY, 'rgba(155, 92, 255, 0.7)', 26)
        }
      }
      if (force.type === 'repel') {
        renderForceTarget(ctx, forceX, forceY, 'rgba(255, 107, 107, 0.8)', 20)
      }
    }

    // ======================================================================
    // Flow field visualization (toggle with 'F' key)
    // ======================================================================

    if (showFlowField) {
      renderFlowField(ctx, width, height, timestamp)
    }

    // ======================================================================
    // Debug overlay (particle count + flow field status)
    // ======================================================================

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(10, height - 65, 220, 55)

    ctx.fillStyle = '#00FF88'
    ctx.font = 'bold 14px monospace'
    ctx.fillText(`Particles: ${state.particles.length}`, 20, height - 45)

    ctx.fillStyle = showFlowField ? '#00FF88' : '#666666'
    ctx.font = '12px monospace'
    ctx.fillText(`Flow Field: ${showFlowField ? 'ON' : 'OFF'} (press F)`, 20, height - 25)
    },

    // ========================================================================
    // Lifecycle: Cleanup - Remove event listeners and clear particles
    // ========================================================================

    cleanup: () => {
      // Remove keyboard listener
      window.removeEventListener('keydown', handleKeyPress)
      
      // Clear all particles
      state.particles = []
      state.activeForces.clear()
      
      // Note: Intent engine subscriptions are cleaned up automatically by the
      // intent engine resource when it's halted, but if we wanted explicit cleanup,
      // we could track unsubscribe functions and call them here.
    }
  }
})

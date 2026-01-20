/**
 * Particle System Render Task
 *
 * Interactive particle system that responds to hand gestures through intent events.
 * Uses Newtonian physics with inverse square law for realistic particle motion.
 *
 * Philosophy: Simple rules compose. Emergence is reliable.
 */

import type { RenderTask } from './types'
import type { FrameHistoryAPI } from '@/core/lib/intent/resources/frameHistoryResource'
import { hexToRgba } from '@/core/lib/colors'
import type { IntentEngineAPI } from '@/core/lib/intent/dsl'


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
}

type ParticleState = {
  particles: Array<Particle>
  activeForces: Map<string, Force>
  maxParticles: number
  nextParticleId: number
}

// ============================================================================
// Constants
// ============================================================================

const MAX_PARTICLES = 1500
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

const REPEL_STRENGTH = VORTEX_STRENGTH * 1.2
const REPEL_SWIRL_STRENGTH = VORTEX_STRENGTH * 0.003
const REPEL_BOOST_MULTIPLIER = 2.5
const REPEL_BOOST_DURATION = 4000 // ms

const SPAWN_VELOCITY = 3 // Higher initial velocity
const SPAWN_VELOCITY_BIAS = 18
const SPAWN_BURST_FRAMES = 6
const SPAWN_BURST_RATE = 10

// Ambient force field
const AMBIENT_FORCE_STRENGTH = 0.5 // Gentle random drift
const AMBIENT_FORCE_FREQUENCY = 0.001 // How often ambient direction changes

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
 */
function applyVortexForce(
  particle: Particle,
  force: Force,
  deltaMs: number,
  forceX?: number,
  forceY?: number
): boolean {
  const fx = forceX ?? force.x
  const fy = forceY ?? force.y
  const dx = particle.x - fx
  const dy = particle.y - fy
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
 */
function applyRepelSwirlForce(
  particle: Particle,
  force: Force,
  deltaMs: number,
  forceX?: number,
  forceY?: number,
  strengthOverride?: number
): void {
  const originX = forceX ?? force.x
  const originY = forceY ?? force.y
  const dx = particle.x - originX
  const dy = particle.y - originY
  const distSq = dx * dx + dy * dy
  const dist = Math.sqrt(distSq)

  const minDist = 8
  const safeDist = Math.max(dist, minDist)

  const strength = strengthOverride ?? force.strength
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
 * Apply ambient force field to keep particles moving
 * Uses simple pseudo-random drift based on particle position and time
 */
function applyAmbientForce(
  particle: Particle,
  timestamp: number,
  deltaMs: number
): void {
  // Use particle position and time to create pseudo-random but smooth drift
  const seed1 = Math.sin(particle.x * 0.01 + timestamp * AMBIENT_FORCE_FREQUENCY) * 0.5 + 0.5
  const seed2 = Math.cos(particle.y * 0.01 + timestamp * AMBIENT_FORCE_FREQUENCY) * 0.5 + 0.5

  // Convert to angle
  const angle = (seed1 + seed2) * Math.PI * 2

  // Apply gentle force in that direction
  const dt = deltaMs / 1000
  particle.vx += Math.cos(angle) * AMBIENT_FORCE_STRENGTH * dt
  particle.vy += Math.sin(angle) * AMBIENT_FORCE_STRENGTH * dt
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
 * Spawn a new particle at position with random velocity
 */
/**
 * Get particle color based on event type.
 * 
 * Supports both patterns:
 * - Single-hand: 'particles:spawn:blue:left' (has :blue:)
 * - Two-hand modifier: 'particles:spawn:modified:blue' (ends with :blue)
 */
function getParticleColor(eventType: string): string {
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
  }

  state.particles.push(particle)
}

/**
 * Render a particle with glow effect
 */
function renderParticle(
  ctx: CanvasRenderingContext2D,
  particle: Particle
): void {
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

// ============================================================================
// Task Factory
// ============================================================================

/**
 * Create particle system render task
 *
 * Subscribes to particle intent events and renders interactive particles.
 */
export const createParticlesTask = (
  intentEngine: IntentEngineAPI,
  frameHistory: FrameHistoryAPI
): RenderTask => {
  // Initialize state
  const state: ParticleState = {
    particles: [],
    activeForces: new Map(),
    maxParticles: MAX_PARTICLES,
    nextParticleId: 0,
  }

  // ========================================================================
  // Event Subscriptions
  // ========================================================================
  
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
    
    intentEngine.on(`${baseId}:start`, (event: any) => {
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

  // ========================================================================
  // Initialize with some particles
  // ========================================================================

  // Spawn initial particles in center of screen (will be set on first render)
  let initialized = false

  // ========================================================================
  // Render Task
  // ========================================================================

  return ({ ctx, width, height, deltaMs, mirrored, timestamp, paused }) => {
    // Initialize particles on first render
    if (!initialized && width > 0 && height > 0) {
      initialized = true
      // Spawn 100 initial particles spread across screen
      for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = SPAWN_VELOCITY * (0.3 + Math.random() * 0.7)
        const particle: Particle = {
          id: `particle_${state.nextParticleId++}`,
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          color: COLORS.default,
          sourceIntent: 'initial',
        }
        state.particles.push(particle)
      }
    }

    // Skip if paused or no delta time
    if (deltaMs <= 0) return

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

        // Determine particle color from event type
        const particleColor = getParticleColor(force.eventType ?? 'particles:spawn')
        
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
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const particle = state.particles[i]
        let shouldDelete = false

        // Apply ambient force field to keep particles moving
        applyAmbientForce(particle, timestamp, deltaMs)

        // Apply forces from all active force fields
        for (const entry of resolvedForces) {
          const { force, forceX, forceY, boostedStrength } = entry

          if (force.type === 'vortex') {
            const dead = applyVortexForce(particle, force, deltaMs, forceX, forceY)
            if (dead) shouldDelete = true
            continue
          }

          applyRepelSwirlForce(
            particle,
            force,
            deltaMs,
            forceX,
            forceY,
            boostedStrength
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
      renderParticle(ctx, particle)
    })

    for (const entry of resolvedForces) {
      const { force, forceX, forceY } = entry
      if (force.type === 'vortex') {
        renderVortexOverlay(ctx, forceX, forceY, timestamp)
        renderForceTarget(ctx, forceX, forceY, 'rgba(155, 92, 255, 0.7)', 26)
      }
      if (force.type === 'repel') {
        renderForceTarget(ctx, forceX, forceY, 'rgba(255, 107, 107, 0.8)', 20)
      }
    }

    // ======================================================================
    // Debug overlay (particle count)
    // ======================================================================

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(10, height - 40, 180, 30)

    ctx.fillStyle = '#00FF88'
    ctx.font = 'bold 14px monospace'
    ctx.fillText(`Particles: ${state.particles.length}`, 20, height - 20)
  }
}

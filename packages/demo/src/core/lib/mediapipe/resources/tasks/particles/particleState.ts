/**
 * Particle State Management
 *
 * Data structures, constants, and state operations for the particle system.
 * Structure of Arrays (SoA) for cache-friendly particle storage.
 *
 * Philosophy: Data is just data. Keep it pure and simple.
 */

import chroma from 'chroma-js'

// ============================================================================
// Types
// ============================================================================

/**
 * Structure of Arrays (SoA) for particle data.
 * Better cache locality and SIMD potential compared to Array of Structures.
 * 
 * All arrays have the same length (capacity).
 * Active particles are tracked via activeIndices array.
 * Free slots are tracked via freeIndices stack for O(1) allocation.
 */
export type ParticleArrays = {
  // Parallel arrays - index i is the same particle
  ids: Array<string>
  x: Array<number>        // viewport coordinates
  y: Array<number>
  vx: Array<number>       // velocity
  vy: Array<number>
  life: Array<number>     // 0-1 (for future fade effects)
  colors: Array<string>   // hex color
  sourceIntents: Array<string>
  trails: Array<Array<{ x: number, y: number }>> // position history for trails

  // Bookkeeping for active/free slots
  activeIndices: Array<number>  // List of currently active particle indices
  freeIndices: Array<number>    // Stack of free indices (LIFO for cache locality)
  capacity: number              // Max capacity
}

export type Force = {
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
  useLogarithmicSpiral?: boolean // Flag to use golden ratio spiral (single-axis for left, triple-axis for right)
}

export type ParticleState = {
  particles: ParticleArrays
  activeForces: Map<string, Force>
  maxParticles: number
  nextParticleId: number
  rainbowHue: number // 0-360, advances over time for rainbow particles
}

/**
 * Options for spawning particles with clean, explicit configuration.
 * Philosophy: Explicit is better than implicit. No magic multipliers.
 */
export type SpawnParticleOptions = {
  /** Position in normalized coordinates */
  position: { x: number; y: number }
  /** Source intent ID for tracking */
  sourceIntent: string
  /** Base velocity magnitude (default: SPAWN_VELOCITY) */
  speed?: number
  /** Directional velocity bias (added directly to vx/vy, not scaled by SPAWN_VELOCITY_BIAS) */
  velocityBias?: { x: number; y: number }
  /** Scale factor for random velocity component (default: 1) */
  velocityScale?: number
  /** Particle color (default: spawn green) */
  color?: string
}

// ============================================================================
// Constants
// ============================================================================

export const MAX_PARTICLES = 1500
export const SPAWN_RATE = 3 // particles per frame
export const PARTICLE_RADIUS = 3
export const GLOW_RADIUS = 8
export const DAMPING = 0.995 // velocity damping (higher = less damping, more movement)

// Force strengths
export const VORTEX_STRENGTH = 300000
export const VORTEX_SWIRL_STRENGTH = VORTEX_STRENGTH * 0.002
export const VORTEX_KILL_RADIUS = 60
export const VORTEX_RING_RADIUS = 200
export const VORTEX_CORE_RADIUS = 60

// Finger vortex (smaller, more localized)
export const FINGER_VORTEX_STRENGTH = VORTEX_STRENGTH * 0.3 // 40% of hand vortex
export const FINGER_VORTEX_SWIRL_STRENGTH = FINGER_VORTEX_STRENGTH * 0.002
export const FINGER_VORTEX_KILL_RADIUS = 20 // Much smaller kill radius
export const FINGER_VORTEX_RING_RADIUS = 60 // Smaller effect radius
export const FINGER_VORTEX_CORE_RADIUS = 25

export const REPEL_STRENGTH = VORTEX_STRENGTH * 1.2
export const REPEL_SWIRL_STRENGTH = VORTEX_STRENGTH * 0.003
export const REPEL_BOOST_MULTIPLIER = 2.5
export const REPEL_BOOST_DURATION = 4000 // ms

export const SPAWN_VELOCITY = 1.31415 // Higher initial velocity
export const SPAWN_VELOCITY_BIAS = 42
export const SPAWN_BURST_FRAMES = 3
export const SPAWN_BURST_RATE = 100
export const TRAIL_LENGTH = 3 // Number of historical positions to keep (motion blur effect)

// Colors by intent type
export const COLORS = {
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
// Particle Array Helpers
// ============================================================================

/**
 * Create empty particle arrays with pre-allocated capacity.
 * Pre-allocation reduces memory churn during particle spawning.
 * Uses free-list for O(1) allocation/deallocation.
 */
export function createParticleArrays(capacity: number): ParticleArrays {
  // Pre-allocate all arrays to avoid reallocation during runtime
  const trails = new Array(capacity)
  // Initialize trail arrays to avoid undefined issues
  for (let i = 0; i < capacity; i++) {
    trails[i] = []
  }

  // Initialize free list with all indices available (0 to capacity-1)
  const freeIndices = new Array(capacity)
  for (let i = 0; i < capacity; i++) {
    freeIndices[i] = i
  }

  return {
    ids: new Array(capacity),
    x: new Array(capacity),
    y: new Array(capacity),
    vx: new Array(capacity),
    vy: new Array(capacity),
    life: new Array(capacity),
    colors: new Array(capacity),
    sourceIntents: new Array(capacity),
    trails,
    activeIndices: [],
    freeIndices,
    capacity,
  }
}

/**
 * Remove particle at index using free-list management (O(1) removal).
 * Marks the index as free and removes from active list.
 */
export function removeParticleAt(particles: ParticleArrays, index: number): void {
  // Find index in activeIndices array
  const activeIdx = particles.activeIndices.indexOf(index)
  if (activeIdx === -1) return // Not an active particle

  // Remove from active list (swap with last for O(1) removal)
  const lastActiveIdx = particles.activeIndices.length - 1
  if (activeIdx !== lastActiveIdx) {
    particles.activeIndices[activeIdx] = particles.activeIndices[lastActiveIdx]
  }
  particles.activeIndices.pop()

  // Add index back to free list
  particles.freeIndices.push(index)

  // Clear the trail to free memory
  particles.trails[index] = []
}

/**
 * Clear all particles (reset to empty state).
 * Arrays remain allocated for reuse.
 */
export function clearAllParticles(particles: ParticleArrays): void {
  particles.activeIndices = []
  particles.freeIndices = []
  for (let i = 0; i < particles.capacity; i++) {
    particles.freeIndices.push(i)
    particles.trails[i] = []
  }
}

// ============================================================================
// Color Helpers
// ============================================================================

/**
 * Get rainbow color from hue rotation (0-360)
 * Creates smooth color spectrum for rainbow particles
 */
export function getRainbowColor(hue: number): string {
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
export function getParticleColor(eventType: string, rainbowHue: number): string {
  // Check for simple spawn - use rainbow
  if (eventType.includes(':simple')) return getRainbowColor(rainbowHue)
  // Check for color anywhere in the string (handles both patterns)
  if (eventType.includes(':blue')) return COLORS.blue
  if (eventType.includes(':green')) return COLORS.green
  if (eventType.includes(':red')) return COLORS.red
  if (eventType.includes(':yellow')) return COLORS.yellow
  return COLORS.spawn // default white/green
}

// ============================================================================
// Particle Spawning
// ============================================================================

/**
 * Spawn a new particle with clean options object.
 * Particles spawn with random velocity and optional directional bias.
 * 
 * SoA version with free-list: allocates from free pool or evicts oldest.
 */
export function spawnParticle(state: ParticleState, options: SpawnParticleOptions): void {
  const {
    position,
    sourceIntent,
    speed = SPAWN_VELOCITY,
    velocityBias,
    velocityScale = 1,
    color = COLORS.spawn,
  } = options

  const particles = state.particles

  // Get a free index, or evict oldest particle if at capacity
  let idx: number
  if (particles.freeIndices.length > 0) {
    // Pop from free list (LIFO for cache locality)
    idx = particles.freeIndices.pop()!
  } else {
    // At capacity - evict oldest particle (first in activeIndices)
    if (particles.activeIndices.length === 0) return // Safety check

    // Get the oldest particle's index and remove it from active list
    const oldestIdx = particles.activeIndices.shift()! // Remove from front (FIFO)

    // Clear the old particle's trail to free memory
    particles.trails[oldestIdx] = []

    // Reuse this index for the new particle (don't add to free list)
    idx = oldestIdx
  }

  // Random angle for spawn velocity
  const angle = Math.random() * Math.PI * 2
  const randomSpeed = speed * (0.5 + Math.random() * 0.5) * velocityScale

  // Write particle data at allocated index
  particles.ids[idx] = `particle_${state.nextParticleId++}`
  particles.x[idx] = position.x
  particles.y[idx] = position.y
  particles.vx[idx] = Math.cos(angle) * randomSpeed + (velocityBias?.x ?? 0)
  particles.vy[idx] = Math.sin(angle) * randomSpeed + (velocityBias?.y ?? 0)
  particles.life[idx] = 1.0
  particles.colors[idx] = color
  particles.sourceIntents[idx] = sourceIntent
  particles.trails[idx] = [{ x: position.x, y: position.y }]

  // Mark as active (add to end - this is now the newest particle)
  particles.activeIndices.push(idx)
}

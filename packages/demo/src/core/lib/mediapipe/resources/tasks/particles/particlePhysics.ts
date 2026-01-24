/**
 * Particle Physics Engine
 *
 * Pure physics calculations and force applications.
 * All functions are deterministic and side-effect free (except for mutating particle arrays).
 *
 * Philosophy: Simple rules compose. Newtonian physics with inverse square law.
 */

import type { Force, ParticleArrays } from './particleState'
import {
  DAMPING,
  FINGER_VORTEX_KILL_RADIUS,
  REPEL_SWIRL_STRENGTH,
  TRAIL_LENGTH,
  VORTEX_KILL_RADIUS,
  VORTEX_SWIRL_STRENGTH,
} from './particleState'

// ============================================================================
// Rotation/Oscillation Helpers
// ============================================================================

/**
 * Calculate oscillation offset for single-axis spiral (LEFT HAND).
 * Uses sine wave to create breathing/wobbling motion.
 * 
 * @param timestamp - Current timestamp in milliseconds
 * @returns Rotation offset in radians
 */
export function calculateSingleAxisOscillation(timestamp: number): number {
  const oscillationSpeed = 0.0003 // Frequency of oscillation
  const oscillationAmplitudeDegrees = 20 // ±20° wobble (tune this in degrees!)
  const oscillationAmplitude = (oscillationAmplitudeDegrees * Math.PI) / 180 // Convert to radians
  return Math.sin(timestamp * oscillationSpeed) * oscillationAmplitude
}

/**
 * Calculate oscillation offset for triple-axis spiral (RIGHT HAND).
 * Uses sine wave to create breathing/wobbling motion for all three axes.
 * 
 * @param timestamp - Current timestamp in milliseconds
 * @returns Rotation offset in radians
 */
export function calculateTripleAxisRotation(timestamp: number): number {
  const oscillationSpeed = 0.0004 // Frequency of oscillation (slightly faster than single-axis)
  const oscillationAmplitudeDegrees = 25 // ±25° wobble (slightly less than single-axis for subtlety)
  const oscillationAmplitude = (oscillationAmplitudeDegrees * Math.PI) / 180 // Convert to radians
  return Math.sin(timestamp * oscillationSpeed) * oscillationAmplitude
}

// ============================================================================
// Physics Functions
// ============================================================================

/**
 * Apply a vortex force: radial attraction + tangential swirl.
 * Returns true if particle should be deleted (fell into the core).
 * Uses direct distance (no toroidal wrapping) for localized effect.
 * 
 * SoA version: operates on particle at given index.
 * Returns distance to vortex center for stability-breaking logic.
 */
export function applyVortexForce(
  particles: ParticleArrays,
  index: number,
  force: Force,
  deltaMs: number,
  forceX: number,
  forceY: number,
  _width: number,
  _height: number
): { shouldDelete: boolean; distance: number } {
  // Use direct distance calculation
  const dx = particles.x[index] - forceX
  const dy = particles.y[index] - forceY
  const distSq = dx * dx + dy * dy
  const dist = Math.sqrt(distSq)

  if (dist < (force.killRadius ?? VORTEX_KILL_RADIUS)) {
    return { shouldDelete: true, distance: dist }
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
  particles.vx[index] += (radialFx + swirlFx) * dt
  particles.vy[index] += (radialFy + swirlFy) * dt

  return { shouldDelete: false, distance: dist }
}

/**
 * Apply a repel swirl: radial repulsion + tangential swirl.
 * Uses direct distance (no toroidal wrapping) for localized effect.
 * 
 * SoA version: operates on particle at given index.
 */
export function applyRepelSwirlForce(
  particles: ParticleArrays,
  index: number,
  force: Force,
  deltaMs: number,
  forceX: number,
  forceY: number,
  strengthOverride: number,
  _width: number,
  _height: number
): void {
  // Use direct distance calculation
  const dx = particles.x[index] - forceX
  const dy = particles.y[index] - forceY
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
  particles.vx[index] += (radialFx + swirlFx) * dt
  particles.vy[index] += (radialFy + swirlFy) * dt
}

/**
 * Apply single-axis logarithmic spiral force (LEFT HAND).
 * Classic galaxy spiral - all particles follow the same golden ratio spiral.
 * Creates nautilus shell / galaxy arm patterns.
 * 
 * The logarithmic spiral equation: r = a * e^(b*θ)
 * Using golden ratio (φ ≈ 1.618) for natural beauty.
 * 
 * Per-Particle Spiral Variation: Each particle gets its own spiral curve
 * by varying the base radius scale factor (a), creating a thick band of
 * particles instead of a thin line. This prevents clustering.
 * 
 * SoA version: operates on particle at given index.
 * Returns distance to vortex center for stability-breaking logic.
 */
export function applySingleAxisSpiralForce(
  particles: ParticleArrays,
  index: number,
  force: Force,
  deltaMs: number,
  forceX: number,
  forceY: number,
  _width: number,
  _height: number,
  timestamp?: number
): { shouldDelete: boolean; distance: number } {
  const dx = particles.x[index] - forceX
  const dy = particles.y[index] - forceY
  const dist = Math.sqrt(dx * dx + dy * dy)

  // Kill particles that reach the center
  if (dist < (force.killRadius ?? FINGER_VORTEX_KILL_RADIUS)) {
    return { shouldDelete: true, distance: dist }
  }

  const minDist = 8
  const safeDist = Math.max(dist, minDist)

  // Single axis - all particles use the same coordinate system
  // Add gentle oscillation (breathing/wobbling) using sine wave
  const rotationOffset = timestamp ? calculateSingleAxisOscillation(timestamp) : 0
  const angle = Math.atan2(dy, dx) + rotationOffset

  // Golden ratio for natural spiral
  const PHI = 1.618033988749895

  // Logarithmic spiral parameter: b = 2/π * ln(φ)
  const b = (2 / Math.PI) * Math.log(PHI)

  // Per-particle spiral variation: each particle gets its own spiral curve
  // Uses particle ID to create consistent but unique variation
  const particleId = particles.ids[index]
  const particlePhase = (particleId.charCodeAt(particleId.length - 1) % 100) / 100

  // Non-linear distribution using smoothstep for better spread
  // This creates more particles in mid-range while maintaining good edge coverage
  // smoothstep(t) = 3t² - 2t³ creates an S-curve
  const smoothPhase = particlePhase * particlePhase * (3 - 2 * particlePhase)

  // Wider range with non-linear distribution: 0.5 to 1.7 (±40% variation)
  const spiralVariation = 0.5 + smoothPhase * 1.2
  const a = 40 * spiralVariation

  // Target radius for current angle along the golden spiral
  const normalizedAngle = ((angle + Math.PI) % (Math.PI * 2)) - Math.PI
  const targetRadius = a * Math.exp(b * normalizedAngle)

  // Radial force: gentle spring toward the spiral curve
  // Keep original strength to maintain spiral structure
  const radialError = safeDist - targetRadius
  const radialSpringConstant = 8
  const radialForceMag = -radialError * radialSpringConstant / safeDist

  // Tangential force: gentle swirling motion along the spiral
  const tangentialForceMag = 80 / safeDist

  // Very gentle inward drift to keep particles near the spiral
  const inwardPullMag = 15 / (safeDist * safeDist)

  // Decompose forces into x/y components
  const radialX = (dx / safeDist) * (radialForceMag - inwardPullMag)
  const radialY = (dy / safeDist) * (radialForceMag - inwardPullMag)

  // Tangential direction (perpendicular to radial, creates swirl)
  const tangentialX = (-dy / safeDist) * tangentialForceMag
  const tangentialY = (dx / safeDist) * tangentialForceMag

  const dt = deltaMs / 1000
  particles.vx[index] += (radialX + tangentialX) * dt
  particles.vy[index] += (radialY + tangentialY) * dt

  return { shouldDelete: false, distance: dist }
}

/**
 * Apply 3-axis logarithmic spiral force (RIGHT HAND).
 * Three diagonal axes create an atomic orbital structure.
 * 
 * Axes (in normalized 0-1 space):
 * - Axis 0: diagonal from top-left to bottom-right (0,0 → 1,1)
 * - Axis 1: vertical from top to bottom (0.5,0 → 0.5,1)
 * - Axis 2: diagonal from bottom-left to top-right (0,1 → 1,0)
 * 
 * Particles are assigned to axes based on index % 3.
 * 
 * Per-Particle Spiral Variation: Each particle gets its own spiral curve
 * by varying the base radius scale factor (a), creating a thick band of
 * particles instead of a thin line. This prevents clustering.
 * 
 * SoA version: operates on particle at given index.
 * Returns distance to vortex center for stability-breaking logic.
 */
export function applyTripleAxisSpiralForce(
  particles: ParticleArrays,
  index: number,
  force: Force,
  deltaMs: number,
  forceX: number,
  forceY: number,
  _width: number,
  _height: number,
  timestamp?: number
): { shouldDelete: boolean; distance: number } {
  const dx = particles.x[index] - forceX
  const dy = particles.y[index] - forceY
  const dist = Math.sqrt(dx * dx + dy * dy)

  // Kill particles that reach the center
  if (dist < (force.killRadius ?? FINGER_VORTEX_KILL_RADIUS)) {
    return { shouldDelete: true, distance: dist }
  }

  const minDist = 8
  const safeDist = Math.max(dist, minDist)

  // THREE-AXIS SPIRAL: Assign particles to one of three diagonal axes
  const axisIndex = index % 3

  // Define axis rotation angles:
  // Axis 0: 45° (diagonal \)
  // Axis 1: 90° (vertical |)
  // Axis 2: 135° (diagonal /)
  // Add slow rotation over time to make the entire orbital structure rotate
  const rotationOffset = timestamp ? calculateTripleAxisRotation(timestamp) : 0
  const axisAngles = [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]
  const axisAngle = axisAngles[axisIndex] + rotationOffset

  // Rotate coordinate system to align with the axis
  const cosA = Math.cos(-axisAngle)
  const sinA = Math.sin(-axisAngle)
  const rotatedDx = dx * cosA - dy * sinA
  const rotatedDy = dx * sinA + dy * cosA

  // Current angle from center in the rotated coordinate system
  const angle = Math.atan2(rotatedDy, rotatedDx)

  // Golden ratio for natural spiral
  const PHI = 1.618033988749895

  // Logarithmic spiral parameter
  const b = (2 / Math.PI) * Math.log(PHI)

  // Per-particle spiral variation: each particle gets its own spiral curve
  // Uses particle ID to create consistent but unique variation
  const particleId = particles.ids[index]
  const particlePhase = (particleId.charCodeAt(particleId.length - 1) % 100) / 100

  // Non-linear distribution using smoothstep for better spread
  // This creates more particles in mid-range while maintaining good edge coverage
  // smoothstep(t) = 3t² - 2t³ creates an S-curve
  const smoothPhase = particlePhase * particlePhase * (3 - 2 * particlePhase)

  // Wider range with non-linear distribution: 0.5 to 1.7 (±40% variation)
  const spiralVariation = 0.5 + smoothPhase * 1.2
  const a = 40 * spiralVariation

  // Target radius for current angle along the golden spiral
  const normalizedAngle = ((angle + Math.PI) % (Math.PI * 2)) - Math.PI
  const targetRadius = a * Math.exp(b * normalizedAngle)

  // Radial force: gentle spring toward the spiral curve
  // Keep original strength to maintain spiral structure
  const radialError = safeDist - targetRadius
  const radialSpringConstant = 8
  const radialForceMag = -radialError * radialSpringConstant / safeDist

  // Tangential force: gentle swirling motion along the spiral
  const tangentialForceMag = 80 / safeDist

  // Very gentle inward drift to keep particles near the spiral
  const inwardPullMag = 15 / (safeDist * safeDist)

  // Decompose forces in the ROTATED coordinate system
  const rotatedRadialX = (rotatedDx / safeDist) * (radialForceMag - inwardPullMag)
  const rotatedRadialY = (rotatedDy / safeDist) * (radialForceMag - inwardPullMag)

  // Tangential direction (perpendicular to radial in rotated space)
  const rotatedTangentialX = (-rotatedDy / safeDist) * tangentialForceMag
  const rotatedTangentialY = (rotatedDx / safeDist) * tangentialForceMag

  // Combine forces in rotated space
  const rotatedForceX = rotatedRadialX + rotatedTangentialX
  const rotatedForceY = rotatedRadialY + rotatedTangentialY

  // Rotate forces BACK to original coordinate system
  const cosB = Math.cos(axisAngle)
  const sinB = Math.sin(axisAngle)
  const finalForceX = rotatedForceX * cosB - rotatedForceY * sinB
  const finalForceY = rotatedForceX * sinB + rotatedForceY * cosB

  const dt = deltaMs / 1000
  particles.vx[index] += finalForceX * dt
  particles.vy[index] += finalForceY * dt

  return { shouldDelete: false, distance: dist }
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
export function simpleNoise(x: number, y: number, t: number): number {
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
 * Apply multi-scale flow field force with per-particle phase offset.
 * Creates organic, swirling patterns for ambient particle motion.
 * 
 * Multi-Scale Turbulence: Layers three noise fields at different scales and speeds:
 * - Large slow swirls (0.5x scale, 0.5x speed) - macro structure
 * - Medium turbulence (1x scale, 1x speed) - mid-range chaos
 * - Small fast jitter (2x scale, 2x speed) - fine detail
 * 
 * Per-Particle Phase Offset: Each particle experiences a slightly different flow field
 * based on its ID, breaking symmetry and preventing clustering at stable orbits.
 * 
 * Stability Breaking: When particles are in stable vortex orbits, amplify
 * the flow field to prevent clustering and maintain visual variety.
 * 
 * SoA version: operates on particle at given index.
 * 
 * @param distanceToNearestVortex - Distance to nearest vortex (if any), used for stability breaking
 * @param vortexRingRadius - Ring radius of nearest vortex (if any)
 */
export function applyFlowFieldForce(
  particles: ParticleArrays,
  index: number,
  timestamp: number,
  deltaMs: number,
  distanceToNearestVortex?: number,
  vortexRingRadius?: number
): void {
  // Per-particle phase offset derived from particle ID
  // Uses last character of ID to create consistent but unique offset (0-1 range)
  const particleId = particles.ids[index]
  const particlePhase = (particleId.charCodeAt(particleId.length - 1) % 100) / 100
  const phaseOffsetX = particlePhase * 100
  const phaseOffsetY = (1 - particlePhase) * 100 // Different offset for Y to avoid diagonal bias

  const px = particles.x[index] + phaseOffsetX
  const py = particles.y[index] + phaseOffsetY

  // Multi-scale flow field: three octaves at different frequencies and speeds
  // Large slow swirls - macro structure (ocean gyres)
  const angle1 = simpleNoise(px * 0.5, py * 0.5, timestamp * 0.5) * Math.PI * 2
  const fx1 = Math.cos(angle1) * 0.5
  const fy1 = Math.sin(angle1) * 0.5

  // Medium turbulence - mid-range chaos (eddies)
  const angle2 = simpleNoise(px, py, timestamp) * Math.PI * 2
  const fx2 = Math.cos(angle2) * 0.3
  const fy2 = Math.sin(angle2) * 0.3

  // Small fast jitter - fine detail (ripples)
  const angle3 = simpleNoise(px * 2, py * 2, timestamp * 2) * Math.PI * 2
  const fx3 = Math.cos(angle3) * 0.25
  const fy3 = Math.sin(angle3) * 0.25

  // Combine all scales
  const combinedFx = fx1 + fx2 + fx3
  const combinedFy = fy1 + fy2 + fy3

  let strength = 0.251415 // Base strength

  // Stability breaking: Amplify flow field when particle is in stable vortex orbit
  // This prevents particles from settling into static clusters
  if (distanceToNearestVortex !== undefined && vortexRingRadius !== undefined) {
    // Particles in the stable orbit zone (between kill radius and ring radius)
    // get extra perturbation to maintain visual variety
    const killRadius = vortexRingRadius * 0.3 // Approximate kill radius ratio
    const isInStableOrbit = distanceToNearestVortex > killRadius && distanceToNearestVortex < vortexRingRadius

    if (isInStableOrbit) {
      // Smooth amplification curve: peaks at mid-orbit, fades at edges
      const normalizedDist = (distanceToNearestVortex - killRadius) / (vortexRingRadius - killRadius)
      const amplification = 1 + Math.sin(normalizedDist * Math.PI) * 4.5 // 1x to 5.5x boost (increased from 3.69)
      strength *= amplification
    }
  }

  const dt = deltaMs / 1000
  particles.vx[index] += combinedFx * strength * dt
  particles.vy[index] += combinedFy * strength * dt
}

/**
 * Update particle position and handle boundaries.
 * 
 * SoA version: operates on particle at given index.
 */
export function updateParticle(
  particles: ParticleArrays,
  index: number,
  width: number,
  height: number,
  deltaMs: number,
  frameCount: number
): void {
  const dt = deltaMs / 1000

  // Store current position before updating (for trails)
  if (frameCount % 2 === index % 2) {
    particles.trails[index].push({ x: particles.x[index], y: particles.y[index] })
  }
  if (particles.trails[index].length > TRAIL_LENGTH) {
    particles.trails[index].shift() // Remove oldest position
  }

  // Update position
  particles.x[index] += particles.vx[index] * dt * 60 // Scale by 60 for consistent speed at 60fps
  particles.y[index] += particles.vy[index] * dt * 60

  // Apply damping
  particles.vx[index] *= DAMPING
  particles.vy[index] *= DAMPING

  // Toroidal wrap around viewport bounds
  if (particles.x[index] < 0) {
    particles.x[index] += width
  } else if (particles.x[index] > width) {
    particles.x[index] -= width
  }

  if (particles.y[index] < 0) {
    particles.y[index] += height
  } else if (particles.y[index] > height) {
    particles.y[index] -= height
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolved force with viewport coordinates.
 * Used for particle-to-vortex assignment.
 */
export type ResolvedForce = {
  force: Force
  forceX: number
  forceY: number
  boostedStrength: number
}

/**
 * Assign each particle to the nearest vortex (if multiple vortexes are active).
 * Returns a map of particle index → vortex index.
 * 
 * When 2+ finger vortexes are active, this partitions particles between them
 * to create distinct visual patterns per hand.
 * 
 * @param particles - Particle arrays
 * @param vortexForces - Array of resolved vortex forces
 * @returns Map of particle index → vortex index in vortexForces array
 */
export function assignParticlesToVortexes(
  particles: ParticleArrays,
  vortexForces: Array<ResolvedForce>
): Map<number, number> {
  const assignments = new Map<number, number>()

  // Only partition if we have 2+ vortexes
  if (vortexForces.length < 2) {
    return assignments // Empty map = all particles affected by all vortexes
  }

  // Assign each active particle to nearest vortex
  for (const particleIdx of particles.activeIndices) {
    let nearestVortexIdx = 0
    let minDistSq = Infinity

    for (let vortexIdx = 0; vortexIdx < vortexForces.length; vortexIdx++) {
      const { forceX, forceY } = vortexForces[vortexIdx]
      const dx = particles.x[particleIdx] - forceX
      const dy = particles.y[particleIdx] - forceY
      const distSq = dx * dx + dy * dy

      if (distSq < minDistSq) {
        minDistSq = distSq
        nearestVortexIdx = vortexIdx
      }
    }

    assignments.set(particleIdx, nearestVortexIdx)
  }

  return assignments
}

/**
 * Calculate the finger vortex position for victory gesture.
 * Returns the midpoint between index and middle fingertips, 
 * offset in the direction away from the palm.
 * 
 * @param gestureResult - MediaPipe gesture result
 * @param hand - Which hand ('left' | 'right')
 * @param handIndex - Hand instance index
 * @param offsetDistance - Distance to offset from midpoint (in normalized coords)
 * @returns Position with offset applied, or null if landmarks not found
 */
export function getFingerVortexPosition(
  gestureResult: any,
  hand: 'left' | 'right',
  handIndex: number,
  offsetDistance: number = 0.15
): { x: number; y: number } | null {
  if (!gestureResult?.landmarks || !gestureResult?.handednesses) return null

  // Find the matching hand
  for (let i = 0; i < gestureResult.landmarks.length; i++) {
    const handednessInfo = gestureResult.handednesses[i]
    if (!handednessInfo?.categories?.[0]) continue

    const handednessLabel = handednessInfo.categories[0].categoryName?.toLowerCase()

    if (handednessLabel === hand && i === handIndex) {
      const landmarks = gestureResult.landmarks[i]

      // Landmark indices:
      // 0 = wrist (palm base)
      // 8 = index finger tip
      // 12 = middle finger tip
      if (!landmarks?.[0] || !landmarks?.[8] || !landmarks?.[12]) return null

      const palm = landmarks[0]
      const indexTip = landmarks[8]
      const middleTip = landmarks[12]

      // Calculate midpoint between index and middle fingertips
      const midX = (indexTip.x + middleTip.x) / 2
      const midY = (indexTip.y + middleTip.y) / 2

      // Calculate direction vector from palm to midpoint
      const dirX = midX - palm.x
      const dirY = midY - palm.y

      // Normalize the direction vector (thanks Pythagoras!)
      const magnitude = Math.sqrt(dirX * dirX + dirY * dirY)

      if (magnitude === 0) {
        // Fallback to midpoint if palm and fingers are at same position
        return { x: midX, y: midY }
      }

      const normalizedDirX = dirX / magnitude
      const normalizedDirY = dirY / magnitude

      // Apply offset along the normalized direction
      return {
        x: midX + normalizedDirX * offsetDistance,
        y: midY + normalizedDirY * offsetDistance,
      }
    }
  }

  return null
}

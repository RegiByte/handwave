/**
 * Particle Rendering
 *
 * All canvas rendering operations for particles and force overlays.
 * Pure visual effects - no state mutation beyond canvas context.
 *
 * Philosophy: Rendering is just drawing. Keep it separate from logic.
 */

import type { ParticleArrays } from './particleState'
import {
  PARTICLE_RADIUS,
  GLOW_RADIUS,
  VORTEX_RING_RADIUS,
  VORTEX_CORE_RADIUS,
  FINGER_VORTEX_RING_RADIUS,
  FINGER_VORTEX_CORE_RADIUS,
} from './particleState'
import { simpleNoise } from './particlePhysics'
import { hexToRgba } from '@/core/lib/colors'

// ============================================================================
// Particle Rendering
// ============================================================================

/**
 * Render a particle with glow effect and motion blur trail.
 * Uses smaller ghost particles to create motion blur effect.
 * 
 * SoA version: renders particle at given index.
 */
export function renderParticle(
  ctx: CanvasRenderingContext2D,
  particles: ParticleArrays,
  index: number,
  width: number,
  height: number
): void {
  const trail = particles.trails[index]
  const px = particles.x[index]
  const py = particles.y[index]
  const color = particles.colors[index]

  // Draw trail as fading ghost particles (motion blur effect)
  if (trail.length > 1) {
    for (let i = 0; i < trail.length - 1; i++) {
      const pos = trail[i]

      // Check if this position involves a wrap - skip if so
      if (i > 0) {
        const prevPos = trail[i - 1]
        const dx = Math.abs(pos.x - prevPos.x)
        const dy = Math.abs(pos.y - prevPos.y)

        // If jump is more than half the viewport, particle wrapped - skip this trail point
        if (dx > width / 2 || dy > height / 2) {
          continue
        }
      }

      // Calculate fade based on position in trail (older = more transparent)
      const age = i / (trail.length - 1)
      const alpha = age * 0.4 // Max 40% opacity for oldest, fades to 0
      const sizeMultiplier = 1 + age * 0.9 // Smaller particles for older positions

      // Draw ghost particle
      const ghostRadius = PARTICLE_RADIUS * sizeMultiplier
      ctx.fillStyle = hexToRgba(color, alpha)
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, ghostRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Draw outer glow
  ctx.fillStyle = hexToRgba(color, 0.2)
  ctx.beginPath()
  ctx.arc(px, py, GLOW_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  // Draw main particle
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(px, py, PARTICLE_RADIUS, 0, Math.PI * 2)
  ctx.fill()
}

// ============================================================================
// Force Overlay Rendering
// ============================================================================

/**
 * Render black-hole style vortex overlay.
 */
export function renderVortexOverlay(
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
export function renderFingerVortexOverlay(
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

/**
 * Render logarithmic spiral overlay (golden ratio).
 * Shows the beautiful nautilus shell / galaxy arm pattern.
 */
/**
 * Render single-axis logarithmic spiral overlay (LEFT HAND).
 * Classic galaxy spiral - all particles follow the same golden ratio spiral.
 */
export function renderSingleAxisSpiralOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timestamp: number
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'

  // Golden ratio parameters
  const PHI = 1.618033988749895
  const b = (2 / Math.PI) * Math.log(PHI)
  const a = 30

  // Pulsing animation
  const pulse = 0.9 + Math.sin(timestamp * 0.005) * 0.1

  // Draw single-axis golden spiral
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)' // Golden color
  ctx.lineWidth = 2
  
  const numArms = 3
  for (let arm = 0; arm < numArms; arm++) {
    const armOffset = (arm * Math.PI * 2) / numArms
    
    ctx.beginPath()
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      const angle = -Math.PI + t * Math.PI * 4 + armOffset + timestamp * 0.001
      const radius = a * Math.exp(b * angle) * pulse

      if (radius > 200) break

      const px = x + Math.cos(angle) * radius
      const py = y + Math.sin(angle) * radius

      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  // Draw center core with golden glow
  ctx.fillStyle = 'rgba(255, 215, 0, 0.8)'
  ctx.beginPath()
  ctx.arc(x, y, FINGER_VORTEX_CORE_RADIUS * 0.8, 0, Math.PI * 2)
  ctx.fill()

  // Outer golden ring
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'
  ctx.fillStyle = 'rgba(255, 215, 0, 0.1)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, FINGER_VORTEX_RING_RADIUS * pulse, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.restore()
}

/**
 * Render 3-axis logarithmic spiral overlay (RIGHT HAND).
 * Three diagonal axes create an atomic orbital structure.
 */
export function renderTripleAxisSpiralOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timestamp: number
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'

  // Golden ratio parameters
  const PHI = 1.618033988749895
  const b = (2 / Math.PI) * Math.log(PHI)
  const a = 30

  // Pulsing animation
  const pulse = 0.9 + Math.sin(timestamp * 0.005) * 0.1

  // Three axis angles: 45°, 90°, 135°
  const axisAngles = [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]
  const axisColors = [
    'rgba(255, 215, 0, 0.6)',   // Golden (diagonal \)
    'rgba(255, 180, 0, 0.5)',   // Amber (vertical |)
    'rgba(255, 140, 0, 0.5)',   // Orange (diagonal /)
  ]

  const numArms = 3
  
  // Draw spiral for each axis
  for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
    const axisAngle = axisAngles[axisIndex]
    ctx.strokeStyle = axisColors[axisIndex]
    ctx.lineWidth = 2

    for (let arm = 0; arm < numArms; arm++) {
      const armOffset = (arm * Math.PI * 2) / numArms
      
      ctx.beginPath()
      for (let i = 0; i <= 100; i++) {
        const t = i / 100
        const angle = -Math.PI + t * Math.PI * 4 + armOffset + timestamp * 0.001
        const radius = a * Math.exp(b * angle) * pulse

        if (radius > 200) break

        // Rotate by axis angle
        const rotatedAngle = angle + axisAngle
        const px = x + Math.cos(rotatedAngle) * radius
        const py = y + Math.sin(rotatedAngle) * radius

        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
  }

  // Draw center core with golden glow
  ctx.fillStyle = 'rgba(255, 215, 0, 0.8)'
  ctx.beginPath()
  ctx.arc(x, y, FINGER_VORTEX_CORE_RADIUS * 0.8, 0, Math.PI * 2)
  ctx.fill()

  // Outer golden ring
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'
  ctx.fillStyle = 'rgba(255, 215, 0, 0.1)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, FINGER_VORTEX_RING_RADIUS * pulse, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.restore()
}

/**
 * Render Lorenz Attractor overlay (chaotic butterfly).
 * Shows the iconic figure-8 / butterfly shape of the strange attractor.
 */
/**
 * Render simple force target indicator (circle).
 */
export function renderForceTarget(
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
// Flow Field Visualization
// ============================================================================

/**
 * Render flow field visualization
 * Shows arrow vectors at grid points indicating the direction and strength of the flow
 */
export function renderFlowField(
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

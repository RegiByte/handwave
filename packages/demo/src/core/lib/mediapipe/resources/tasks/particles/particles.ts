/**
 * Particle System Render Task
 *
 * Interactive particle system that responds to hand gestures through intent events.
 * Task orchestration layer - composes state, physics, and rendering modules.
 *
 * Philosophy: Simple rules compose. Emergence is reliable.
 */

import { task } from '@handwave/system'
import type { Intent } from '@handwave/intent-engine'

// Local module imports - clean separation of concerns

import { mapLandmarkToViewport } from '@handwave/mediapipe'
import type { RenderContext } from '@handwave/mediapipe';
import type { ParticleState } from './particleState'
import {
  COLORS,
  FINGER_VORTEX_KILL_RADIUS,
  FINGER_VORTEX_STRENGTH,
  FINGER_VORTEX_SWIRL_STRENGTH,
  MAX_PARTICLES,
  REPEL_BOOST_DURATION,
  REPEL_BOOST_MULTIPLIER,
  REPEL_STRENGTH,
  REPEL_SWIRL_STRENGTH,
  SPAWN_BURST_FRAMES,
  SPAWN_BURST_RATE,
  SPAWN_RATE,
  SPAWN_VELOCITY,
  SPAWN_VELOCITY_BIAS,
  VORTEX_KILL_RADIUS,
  VORTEX_STRENGTH,
  VORTEX_SWIRL_STRENGTH,
  clearAllParticles,
  createParticleArrays,
  getParticleColor,
  getRainbowColor,
  removeParticleAt,
  spawnParticle,
} from './particleState'

import type { ResolvedForce } from './particlePhysics'
import {
  applyFlowFieldForce,
  applyRepelSwirlForce,
  applySingleAxisSpiralForce,
  applyTripleAxisSpiralForce,
  applyVortexForce,
  assignParticlesToVortexes,
  getFingerVortexPosition,
  updateParticle,
} from './particlePhysics'

import {
  renderFingerVortexOverlay,
  renderFlowField,
  renderForceTarget,
  renderParticle,
  renderSingleAxisSpiralOverlay,
  renderTripleAxisSpiralOverlay,
  renderVortexOverlay,
} from './particleRendering'
import { getFaceOvalIndices } from '@/core/lib/mediapipe/resources/tasks/face-mesh'

// Intent imports
import type { IntentEngineAPI } from '@/core/lib/intent/resources/intentEngineResource'
import {
  clearParticles,
  fingerVortexLeft,
  fingerVortexRight,
  repelParticles,
  spawnBlueWithModifier,
  spawnFromFaceOutline,
  spawnGreenWithModifier,
  spawnParticlesSimple,
  spawnRedWithModifier,
  spawnYellowWithModifier,
  vortexParticles,
} from '@/core/lib/intent/intents/particleIntents'

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
    particles: createParticleArrays(MAX_PARTICLES),
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
  let frameCount = 0

  // ========================================================================
  // Lifecycle: Init - Subscribe to events
  // ========================================================================

  return {
    init: () => {
      // Add keyboard listener
      window.addEventListener('keydown', handleKeyPress)

      // ============================================================================
      // TYPE-SAFE EVENT SUBSCRIPTIONS
      // ============================================================================
      // Using the new subscribe() API with intent event descriptors for full type safety!

      // Spawn particles intent (simple spawn - any hand)
      intentEngine.subscribe(spawnParticlesSimple.events.start, (event) => {
        state.activeForces.set(event.id, {
          type: 'spawn',
          x: 0, // will be updated in update event
          y: 0,
          strength: 0,
          burstFrames: SPAWN_BURST_FRAMES,
          hand: event.hand,
          handIndex: event.handIndex,
          eventType: event.type,
        })
      })

      intentEngine.subscribe(spawnParticlesSimple.events.update, (event) => {
        const force = state.activeForces.get(event.id)
        if (force) {
          force.x = event.position.x
          force.y = event.position.y
          force.vx = event.velocity?.x ?? 0
          force.vy = event.velocity?.y ?? 0
        }
      })

      intentEngine.subscribe(spawnParticlesSimple.events.end, (event) => {
        state.activeForces.delete(event.id)
      })

      // ========================================================================
      // Two-hand modifier spawn intents (left modifier + right action)
      // ========================================================================

      // Helper to register modifier spawn intents
      // These use the right hand position for spawning (action hand)
      // Note: Two-hand intents don't have :left/:right suffix since they require BOTH hands
      const registerModifierSpawn = (intent: Intent<any, any>) => {
        intentEngine.subscribe(intent.events.start, (event) => {
          state.activeForces.set(event.id, {
            type: 'spawn',
            x: 0,
            y: 0,
            strength: 0,
            vx: 0,
            vy: 0,
            burstFrames: SPAWN_BURST_FRAMES,
            eventType: intent.id,
          })
        })

        intentEngine.subscribe(intent.events.update, (event) => {
          const force = state.activeForces.get(event.id)
          if (force) {
            force.x = event.position.x
            force.y = event.position.y
            force.vx = event.velocity?.x ?? 0
            force.vy = event.velocity?.y ?? 0
          }
        })

        intentEngine.subscribe(intent.events.end, (event) => {
          state.activeForces.delete(event.id)
        })
      }

      // Register all modifier spawn intents
      registerModifierSpawn(spawnBlueWithModifier)
      registerModifierSpawn(spawnGreenWithModifier)
      registerModifierSpawn(spawnRedWithModifier)
      registerModifierSpawn(spawnYellowWithModifier)

      // Vortex particles intent (supports both hands independently)
      intentEngine.subscribe(vortexParticles.events.start, (event) => {
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

      intentEngine.subscribe(vortexParticles.events.update, (event) => {
        const force = state.activeForces.get(event.id)
        if (force) {
          force.x = event.position.x
          force.y = event.position.y
        }
      })

      intentEngine.subscribe(vortexParticles.events.end, (event) => {
        state.activeForces.delete(event.id)
      })

      // Finger vortex LEFT HAND: Single-axis logarithmic spiral
      // Creates classic galaxy spiral - all particles follow the same golden ratio spiral
      intentEngine.subscribe(fingerVortexLeft.events.start, (event) => {
        const fingerPos = getFingerVortexPosition(latestGestureResult, event.hand, event.handIndex)
        if (!fingerPos) return

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
          useLogarithmicSpiral: true, // Single-axis galaxy spiral
        })
      })

      intentEngine.subscribe(fingerVortexLeft.events.update, (event) => {
        const force = state.activeForces.get(event.id)
        if (!force) return

        // Recalculate position with offset on each update
        const fingerPos = getFingerVortexPosition(latestGestureResult, event.hand, event.handIndex)
        if (fingerPos) {
          force.x = fingerPos.x
          force.y = fingerPos.y
        }
      })

      intentEngine.subscribe(fingerVortexLeft.events.end, (event) => {
        state.activeForces.delete(event.id)
      })

      // Finger vortex RIGHT HAND: Triple-axis logarithmic spiral
      // Creates atomic orbital structure - three diagonal axes (45°, 90°, 135°)
      intentEngine.subscribe(fingerVortexRight.events.start, (event) => {
        const fingerPos = getFingerVortexPosition(latestGestureResult, event.hand, event.handIndex)
        if (!fingerPos) return

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
          useLogarithmicSpiral: true, // Triple-axis atomic orbital spiral
        })
      })

      intentEngine.subscribe(fingerVortexRight.events.update, (event) => {
        const force = state.activeForces.get(event.id)
        if (!force) return

        // Recalculate position with offset on each update
        const fingerPos = getFingerVortexPosition(latestGestureResult, event.hand, event.handIndex)
        if (fingerPos) {
          force.x = fingerPos.x
          force.y = fingerPos.y
        }
      })

      intentEngine.subscribe(fingerVortexRight.events.end, (event) => {
        state.activeForces.delete(event.id)
      })

      // Repel particles intent (supports both hands independently)
      intentEngine.subscribe(repelParticles.events.start, (event) => {
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

      intentEngine.subscribe(repelParticles.events.update, (event) => {
        const force = state.activeForces.get(event.id)
        if (force) {
          force.x = event.position.x
          force.y = event.position.y
        }
      })

      intentEngine.subscribe(repelParticles.events.end, (event) => {
        state.activeForces.delete(event.id)
      })

      // Clear particles intent (any hand can trigger)
      intentEngine.subscribe(clearParticles.events.start, () => {
        clearAllParticles(state.particles)
      })

      // Face outline spawn intent (both hands victory) - using legacy API for now
      intentEngine.subscribe(spawnFromFaceOutline.events.start, () => {
        faceOutlineSpawnActive = true
      })

      intentEngine.subscribe(spawnFromFaceOutline.events.update, () => {
        faceOutlineSpawnActive = true
      })

      intentEngine.subscribe(spawnFromFaceOutline.events.end, () => {
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
          const speed = SPAWN_VELOCITY * (0.3 + Math.random() * 0.7)
          const x = Math.random() * width
          const y = Math.random() * height

          spawnParticle(state, {
            position: { x, y },
            sourceIntent: 'initial',
            speed,
            color: COLORS.default,
          })
        }
      }

      // Skip if paused or no delta time
      if (deltaMs <= 0) return

      frameCount++

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

          const velocityBias = {
            x: force.vx ?? 0,
            y: force.vy ?? 0,
          }

          if (mirrored) {
            spawnX = width - spawnX
            velocityBias.x = -velocityBias.x
          }

          // Determine particle color from event type (pass rainbow hue for simple spawn)
          const particleColor = getParticleColor(force.eventType ?? 'particles:spawn', state.rainbowHue)

          // Spawn multiple particles per frame
          for (let i = 0; i < SPAWN_RATE; i++) {
            spawnParticle(state, {
              position: { x: spawnX, y: spawnY },
              sourceIntent: 'particles:spawn',
              velocityBias: {
                x: velocityBias.x * SPAWN_VELOCITY_BIAS,
                y: velocityBias.y * SPAWN_VELOCITY_BIAS,
              },
              color: particleColor,
            })
          }

          if ((force.burstFrames ?? 0) > 0) {
            for (let i = 0; i < SPAWN_BURST_RATE; i++) {
              spawnParticle(state, {
                position: { x: spawnX, y: spawnY },
                sourceIntent: 'particles:spawn',
                velocityBias: {
                  x: velocityBias.x * SPAWN_VELOCITY_BIAS,
                  y: velocityBias.y * SPAWN_VELOCITY_BIAS,
                },
                velocityScale: 1.5,
                color: particleColor,
              })
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

      if (faceOutlineSpawnActive && !paused && faceOvalSegments.length > 0 && frameCount % 4 === 0) {
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

          // Use rainbow colors for face outline particles
          const particleColor = getRainbowColor(state.rainbowHue)

          // Spawn 2 particles per segment with very gentle outward drift
          for (let j = 0; j < 2; j++) {
            spawnParticle(state, {
              position: { x: spawnX, y: spawnY },
              sourceIntent: 'particles:spawn:face-outline',
              speed: 0.05, // Very slow initial velocity
              velocityBias: {
                x: outwardX * 0.5, // Gentle outward drift
                y: outwardY * 0.5,
              },
              velocityScale: 0.3, // Further reduce randomness
              color: particleColor,
            })
          }
        }
      }

      // ======================================================================
      // Update physics for all particles
      // ======================================================================

      const resolvedForces: Array<ResolvedForce> = Array.from(state.activeForces.values())
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
        // ====================================================================
        // DUAL VORTEX SUPPORT & STABILITY BREAKING
        // ====================================================================
        // When 2+ finger vortexes are active, partition particles between them
        // to create distinct visual patterns per hand. Also track nearest vortex
        // distance for stability-breaking flow field amplification.

        // Separate vortex and repel forces for dual vortex support
        const vortexForces = resolvedForces.filter(entry => entry.force.type === 'vortex')
        const repelForces = resolvedForces.filter(entry => entry.force.type === 'repel')

        // Assign particles to vortexes when 2+ finger vortexes are active
        // This creates distinct visual patterns per hand
        const fingerVortexes = vortexForces.filter(entry => entry.force.isFingerVortex)
        const particleVortexAssignments = fingerVortexes.length >= 2
          ? assignParticlesToVortexes(state.particles, fingerVortexes)
          : new Map() // Empty = all particles affected by all vortexes

        // Update all active particles (iterate backwards for safe deletion)
        const particles = state.particles
        for (let activeIdx = particles.activeIndices.length - 1; activeIdx >= 0; activeIdx--) {
          const i = particles.activeIndices[activeIdx]
          let shouldDelete = false
          let nearestVortexDistance: number | undefined
          let nearestVortexRingRadius: number | undefined

          // Apply vortex forces (with partitioning for dual finger vortex)
          for (let vortexIdx = 0; vortexIdx < vortexForces.length; vortexIdx++) {
            const entry = vortexForces[vortexIdx]
            const { force, forceX, forceY } = entry

            // Skip this vortex if particle is assigned to a different one
            if (particleVortexAssignments.size > 0) {
              const assignedVortexIdx = particleVortexAssignments.get(i)
              // Find which index this vortex is in the fingerVortexes array
              const fingerVortexIdx = fingerVortexes.indexOf(entry)
              if (fingerVortexIdx !== -1 && assignedVortexIdx !== fingerVortexIdx) {
                continue // Skip - particle belongs to different vortex
              }
            }

            // Choose between different attractor types based on hand
            let result: { shouldDelete: boolean; distance: number }
            if (force.hand === 'left' && force.useLogarithmicSpiral) {
              // Left hand: single-axis galaxy spiral
              result = applySingleAxisSpiralForce(particles, i, force, deltaMs, forceX, forceY, width, height, timestamp)
            } else if (force.hand === 'right' && force.useLogarithmicSpiral) {
              // Right hand: 3-axis atomic orbital spiral
              result = applyTripleAxisSpiralForce(particles, i, force, deltaMs, forceX, forceY, width, height, timestamp)
            } else {
              // Default vortex
              result = applyVortexForce(particles, i, force, deltaMs, forceX, forceY, width, height)
            }

            if (result.shouldDelete) shouldDelete = true

            // Track nearest vortex for stability breaking
            if (nearestVortexDistance === undefined || result.distance < nearestVortexDistance) {
              nearestVortexDistance = result.distance
              // Estimate ring radius based on vortex type
              nearestVortexRingRadius = force.isFingerVortex ? 80 : 200
            }
          }

          // Apply repel forces (no partitioning needed)
          for (const entry of repelForces) {
            const { force, forceX, forceY, boostedStrength } = entry
            applyRepelSwirlForce(
              particles,
              i,
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
            removeParticleAt(particles, i)
            continue
          }

          // Apply flow field force with stability breaking
          // When particles are in stable vortex orbits, amplify flow field to prevent clustering
          applyFlowFieldForce(particles, i, timestamp, deltaMs, nearestVortexDistance, nearestVortexRingRadius)

          // Update position and handle boundaries
          updateParticle(particles, i, width, height, deltaMs, frameCount)
        }
      }

      // ======================================================================
      // Render all particles
      // ======================================================================

      const particles = state.particles
      for (const i of particles.activeIndices) {
        renderParticle(ctx, particles, i, width, height)
      }

      for (const entry of resolvedForces) {
        const { force, forceX, forceY } = entry
        if (force.type === 'vortex') {
          if (force.isFingerVortex) {
            // Choose overlay based on hand and attractor type
            if (force.hand === 'left' && force.useLogarithmicSpiral) {
              // Left hand: single-axis galaxy spiral
              renderSingleAxisSpiralOverlay(ctx, forceX, forceY, timestamp)
              renderForceTarget(ctx, forceX, forceY, 'rgba(255, 215, 0, 0.8)', 18) // Golden color
            } else if (force.hand === 'right' && force.useLogarithmicSpiral) {
              // Right hand: 3-axis atomic orbital spiral
              renderTripleAxisSpiralOverlay(ctx, forceX, forceY, timestamp)
              renderForceTarget(ctx, forceX, forceY, 'rgba(255, 140, 0, 0.8)', 18) // Orange color
            } else {
              // Default finger vortex
              renderFingerVortexOverlay(ctx, forceX, forceY, timestamp)
              renderForceTarget(ctx, forceX, forceY, 'rgba(8, 231, 204, 0.8)', 18)
            }
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
      ctx.fillText(`Particles: ${state.particles.activeIndices.length}`, 20, height - 45)

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
      clearAllParticles(state.particles)
      state.activeForces.clear()

      // Note: Intent engine subscriptions are cleaned up automatically by the
      // intent engine resource when it's halted, but if we wanted explicit cleanup,
      // we could track unsubscribe functions and call them here.
    }
  }
})

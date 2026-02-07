import { transformLandmarksToViewport } from '@handwave/mediapipe'
import type { RenderContext, RenderTask } from '@handwave/mediapipe'
import { createColorScale, hexToRgba, mixColors, remap } from '@handwave/rendering'
import { task } from '@handwave/system'

/**
 * Custom hand connection patterns
 * Hand landmarks: 0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
 *
 * Connection type with optional minDistance constraint:
 * - start: starting landmark index
 * - end: ending landmark index
 * - minDistance: optional minimum distance threshold (only render if distance < minDistance)
 */
type RenderableConnection = {
  start: number
  end: number
  minDistance?: number
}

// Only draw the "skeleton" - major joints
const HAND_SKELETON_CONNECTIONS: Array<RenderableConnection> = [
  { start: 0, end: 1 }, // Wrist to thumb base
  { start: 0, end: 5 }, // Wrist to index base
  { start: 0, end: 9 }, // Wrist to middle base
  { start: 0, end: 13 }, // Wrist to ring base
  { start: 0, end: 17 }, // Wrist to pinky base
  { start: 5, end: 9 }, // Index to middle base
  { start: 9, end: 13 }, // Middle to ring base
  { start: 13, end: 17 }, // Ring to pinky base
  // Thumb
  { start: 1, end: 2 },
  { start: 2, end: 3 },
  { start: 3, end: 4 },
  // Index finger
  { start: 5, end: 6 },
  { start: 6, end: 7 },
  { start: 7, end: 8 },
  // Middle finger
  { start: 9, end: 10 },
  { start: 10, end: 11 },
  { start: 11, end: 12 },
  { start: 12, end: 4, minDistance: 0.2 }, // Middle to thumb (only when close)
  // Ring finger
  { start: 13, end: 14 },
  { start: 14, end: 15 },
  { start: 15, end: 16 },
  { start: 16, end: 4, minDistance: 0.2 }, // Ring to thumb (only when close)
  // Pinky finger
  { start: 17, end: 18 },
  { start: 18, end: 19 },
  { start: 19, end: 20 },
  { start: 20, end: 4, minDistance: 0.2 }, // Pinky to thumb (only when close)
]

// Only fingertips connected
const FINGERTIPS_CONNECTIONS: Array<RenderableConnection> = [
  { start: 0, end: 4 }, // Wrist to thumb base
  { start: 4, end: 8, minDistance: 0.3 }, // Thumb to index
  { start: 8, end: 12 }, // Index to middle
  { start: 12, end: 4, minDistance: 0.2 }, // Middle to thumb (only when close)
  { start: 12, end: 16 }, // Middle to ring
  { start: 16, end: 4, minDistance: 0.2 }, // Ring to thumb (only when close)
  { start: 16, end: 20 }, // Ring to pinky
  { start: 20, end: 4, minDistance: 0.2 }, // Pinky to thumb (only when close)
  { start: 20, end: 0 }, // Pinky to wrist
]

// Palm area connections
const PALM_CONNECTIONS: Array<RenderableConnection> = [
  { start: 0, end: 1 },
  { start: 0, end: 5 },
  { start: 0, end: 9 },
  { start: 0, end: 13 },
  { start: 0, end: 17 },
  { start: 5, end: 9 },
  { start: 9, end: 13 },
  { start: 13, end: 17 },
  { start: 1, end: 5 },
]

/**
 * Helper: Filter connections based on minDistance constraint
 * @param connections - Array of connections with optional minDistance
 * @param landmarks - Transformed landmarks with x, y, z coordinates
 * @returns Filtered array of connections that meet distance requirements
 */
function filterConnectionsByDistance(
  connections: Array<RenderableConnection>,
  landmarks: Array<{ x: number; y: number; z: number }>,
): Array<RenderableConnection> {
  return connections.filter((connection) => {
    // If no minDistance constraint, always include
    if (connection.minDistance === undefined) return true

    const from = landmarks[connection.start]
    const to = landmarks[connection.end]
    if (!from || !to) return false

    // Calculate 3D Euclidean distance
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

    // Only include if distance is less than minDistance
    return distance < connection.minDistance
  })
}

/**
 * Render task: Show hand with custom skeleton connections
 * Emphasizes the major joints and bone structure
 * Uses mathematical interpolation for smooth depth-based coloring
 * Displays numeric indices on landmarks
 * 
 * Optimized: Uses object form with init phase to avoid repeated allocations
 * Renders every other frame to reduce overhead
 */
export const handSkeletonTask = task<RenderContext, undefined>(() => {
  // Define depth range for color mapping (constants)
  const DEPTH_MIN = -0.15
  const DEPTH_MAX = 0.15

  // State initialized once
  let depthColorScale: Array<string>

  return {
    init: () => {
      // Create color scale once during initialization
      depthColorScale = createColorScale('#4169e1', '#ff4757', 100)
    },

    execute: ({
      drawer,
      ctx,
      detectionFrame,
      mirrored,
      viewport,
      width,
      height,
    }) => {
      const hands = detectionFrame?.detectors?.hand
      if (!hands || hands.length === 0) return

      // Process each hand
      for (let i = 0; i < hands.length; i++) {
        const hand = hands[i]
        const landmarks = hand.landmarks
        const transformed = transformLandmarksToViewport(
          landmarks,
          viewport,
          width,
          height,
          mirrored,
        )

        // Filter connections based on distance constraints
        const connectionsToRender = filterConnectionsByDistance(
          HAND_SKELETON_CONNECTIONS,
          transformed,
        )

        // Draw skeleton with smooth depth-based color interpolation
        drawer.drawConnectors(transformed, connectionsToRender, {
          color: (data) => {
            const z = data.from?.z ?? 0
            // Remap depth to color scale index (0-99)
            const colorIndex = Math.floor(
              remap(z, DEPTH_MIN, DEPTH_MAX, 0, 99, true),
            )
            return depthColorScale[colorIndex]
          },
          lineWidth: (data) => {
            const z = data.from?.z ?? 0
            // Remap depth to line width (2-8) - closer = thicker
            return remap(z, DEPTH_MIN, DEPTH_MAX, 2, 8, true)
          },
        })

        // Draw joints with smooth size and color interpolation
        drawer.drawLandmarks(transformed, {
          radius: (data) => {
            const idx = data.index ?? 0
            const z = data.from?.z ?? 0

            // Base size by landmark type
            let baseRadius = 6
            if (idx === 0) baseRadius = 8 // Wrist
            else if ([4, 8, 12, 16, 20].includes(idx)) baseRadius = 6 // Fingertips

            // Scale by depth (closer = slightly bigger)
            const depthScale = remap(z, DEPTH_MIN, DEPTH_MAX, 0.8, 1.2, true)
            return baseRadius * depthScale
          },
          color: (data) => {
            const idx = data.index ?? 0
            const z = data.from?.z ?? 0

            // Base colors
            let baseColor = '#95e1d3' // Default teal
            if (idx === 0) baseColor = '#ffffff' // Wrist
            else if ([4, 8, 12, 16, 20].includes(idx)) baseColor = '#ffd93d' // Fingertips

            // Mix with depth color for subtle depth indication
            const colorIndex = Math.floor(
              remap(z, DEPTH_MIN, DEPTH_MAX, 0, 99, true),
            )
            const depthColor = depthColorScale[colorIndex]

            // Mix 80% base color, 20% depth color
            return mixColors(baseColor, depthColor, 0.2)
          },
          fillColor: (data) => {
            const idx = data.index ?? 0
            const z = data.from?.z ?? 0

            // Base colors
            let baseColor = '#95e1d3' // Default teal
            if (idx === 0) baseColor = '#ffffff' // Wrist
            else if ([4, 8, 12, 16, 20].includes(idx)) baseColor = '#ffd93d' // Fingertips

            // Mix with depth color for subtle depth indication
            const colorIndex = Math.floor(
              remap(z, DEPTH_MIN, DEPTH_MAX, 0, 99, true),
            )
            const depthColor = depthColorScale[colorIndex]

            // Mix 80% base color, 20% depth color
            return mixColors(baseColor, depthColor, 0.2)
          },
        })

        // Draw numeric indices on top of landmarks
        ctx.save()
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'
        ctx.shadowBlur = 4
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1

        for (let j = 0; j < transformed.length; j++) {
          const landmark = transformed[j]
          const x = landmark.x * width
          const y = landmark.y * height

          // Get the landmark's base color for the text
          let textColor = '#ffffff'
          if (j === 0) textColor = '#ffffff' // Wrist - white
          else if ([4, 8, 12, 16, 20].includes(j)) textColor = '#000000' // Fingertips - black
          else textColor = '#000000' // Other joints - black

          ctx.fillStyle = textColor
          ctx.fillText(j.toString(), x, y)
        }

        ctx.restore()
      }
    },
  }
})

/**
 * Render task: Show only fingertips connected with distance measurements
 * Useful for gesture visualization and hand size analysis
 * Uses color interpolation for smooth visual feedback
 * Displays distance in normalized units at the midpoint of each connection
 * 
 * Optimized: Renders every other frame to reduce overhead
 */
export const fingertipsConnectorsTask = task<RenderContext, undefined>(() => {
  return {
    execute: ({
      drawer,
      ctx,
      detectionFrame,
      mirrored,
      viewport,
      width,
      height,
    }) => {

      const hands = detectionFrame?.detectors?.hand
      if (!hands || hands.length === 0) return

      for (let i = 0; i < hands.length; i++) {
        const hand = hands[i]
        const landmarks = hand.landmarks
        const transformed = transformLandmarksToViewport(
          landmarks,
          viewport,
          width,
          height,
          mirrored,
        )

        // Filter connections based on distance constraints
        const connectionsToRender = filterConnectionsByDistance(
          FINGERTIPS_CONNECTIONS,
          transformed,
        )

        // Draw fingertip connections with gradient effect
        drawer.drawConnectors(transformed, connectionsToRender, {
          color: (data) => {
            const avgZ = ((data.from?.z ?? 0) + (data.to?.z ?? 0)) / 2

            // Remap depth to opacity for connections
            const opacity = remap(avgZ, -0.15, 0.15, 0.4, 1.0, true)

            return hexToRgba('#ff00ff', opacity)
          },
          lineWidth: (data) => {
            const avgZ = ((data.from?.z ?? 0) + (data.to?.z ?? 0)) / 2

            // Thicker when closer
            return remap(avgZ, -0.15, 0.15, 2, 5, true)
          },
        })

        // Draw distance measurements at the midpoint of each connection
        // Only for connections that are actually rendered
        ctx.save()
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'
        ctx.shadowBlur = 3
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1

        connectionsToRender.forEach((connection) => {
          const from = transformed[connection.start]
          const to = transformed[connection.end]

          if (!from || !to) return

          // Calculate 3D Euclidean distance (using normalized coordinates)
          const dx = to.x - from.x
          const dy = to.y - from.y
          const dz = to.z - from.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

          // Calculate midpoint in pixel coordinates
          const midX = ((from.x + to.x) / 2) * width
          const midY = ((from.y + to.y) / 2) * height

          // Calculate average depth for color/opacity
          const avgZ = (from.z + to.z) / 2
          const opacity = remap(avgZ, -0.15, 0.15, 0.6, 1.0, true)

          // Format distance (show 3 decimal places)
          const distanceText = distance.toFixed(3)

          // Draw distance label
          ctx.fillStyle = hexToRgba('#ffff00', opacity) // Yellow text
          ctx.fillText(distanceText, midX, midY)
        })

        ctx.restore()
      }
    },
  }
})

/**
 * Render task: Highlight palm area
 * Shows the palm structure separately from fingers
 * Uses smooth color interpolation and depth-aware gradients
 * 
 * Optimized: Uses object form with init phase, renders every other frame
 */
export const palmHighlightTask = task<RenderContext, undefined>(() => {
  // State initialized once
  let palmColorScale: Array<string>
  const palmIndices = [0, 1, 5, 9, 13, 17]

  return {
    init: () => {
      // Create warm color palette for palm once
      palmColorScale = createColorScale('#ff6b35', '#ffd93d', 50)
    },

    execute: ({
      drawer,
      ctx,
      detectionFrame,
      mirrored,
      viewport,
      width,
      height,
    }) => {

      const hands = detectionFrame?.detectors?.hand
      if (!hands || hands.length === 0) return

      for (let i = 0; i < hands.length; i++) {
        const hand = hands[i]
        const landmarks = hand.landmarks
        const transformed = transformLandmarksToViewport(
          landmarks,
          viewport,
          width,
          height,
          mirrored,
        )

        // Calculate average palm depth for color selection
        let avgPalmDepth = 0
        for (let j = 0; j < palmIndices.length; j++) {
          avgPalmDepth += transformed[palmIndices[j]]?.z ?? 0
        }
        avgPalmDepth /= palmIndices.length

        // Select base color from scale based on depth
        const colorIndex = Math.floor(remap(avgPalmDepth, -0.15, 0.15, 0, 49, true))
        const palmBaseColor = palmColorScale[colorIndex]

        // Draw palm connections with depth-aware opacity
        drawer.drawConnectors(transformed, PALM_CONNECTIONS, {
          color: (data) => {
            const avgZ = ((data.from?.z ?? 0) + (data.to?.z ?? 0)) / 2
            const opacity = remap(avgZ, -0.15, 0.15, 0.4, 0.8, true)
            return hexToRgba(palmBaseColor, opacity)
          },
          lineWidth: (data) => {
            const avgZ = ((data.from?.z ?? 0) + (data.to?.z ?? 0)) / 2
            return remap(avgZ, -0.15, 0.15, 2, 5, true)
          },
        })

        // Fill palm area with smooth radial gradient
        ctx.save()

        // Build palm points array
        const palmPoints = []
        for (let j = 0; j < palmIndices.length; j++) {
          const idx = palmIndices[j]
          palmPoints.push({
            x: transformed[idx].x * width,
            y: transformed[idx].y * height,
            z: transformed[idx].z,
          })
        }

        // Calculate center
        let centerX = 0
        let centerY = 0
        for (let j = 0; j < palmPoints.length; j++) {
          centerX += palmPoints[j].x
          centerY += palmPoints[j].y
        }
        centerX /= palmPoints.length
        centerY /= palmPoints.length

        // Calculate max distance
        let maxDist = 0
        for (let j = 0; j < palmPoints.length; j++) {
          const p = palmPoints[j]
          const dist = Math.sqrt((p.x - centerX) ** 2 + (p.y - centerY) ** 2)
          if (dist > maxDist) maxDist = dist
        }

        // Create depth-aware gradient
        const innerOpacity = remap(avgPalmDepth, -0.15, 0.15, 0.2, 0.6, true)
        const outerOpacity = innerOpacity * 0.1

        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          maxDist,
        )
        gradient.addColorStop(0, hexToRgba(palmBaseColor, innerOpacity))
        gradient.addColorStop(1, hexToRgba(palmBaseColor, outerOpacity))

        // Draw filled palm
        ctx.fillStyle = gradient
        ctx.beginPath()
        for (let j = 0; j < palmPoints.length; j++) {
          const p = palmPoints[j]
          if (j === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.closePath()
        ctx.fill()

        ctx.restore()

        // Draw palm landmarks with depth-based sizing
        for (let j = 0; j < palmIndices.length; j++) {
          const idx = palmIndices[j]
          const landmark = transformed[idx]
          if (!landmark) continue

          const z = landmark.z
          const radius = remap(z, -0.15, 0.15, 3, 6, true)
          const opacity = remap(z, -0.15, 0.15, 0.5, 1.0, true)

          drawer.drawLandmarks([landmark], {
            radius,
            color: palmBaseColor,
            fillColor: hexToRgba(palmBaseColor, opacity * 0.5),
          })
        }
      }
    },
  }
})

export const handSkeletonTasks = [
  fingertipsConnectorsTask,
  palmHighlightTask,
  handSkeletonTask,
]

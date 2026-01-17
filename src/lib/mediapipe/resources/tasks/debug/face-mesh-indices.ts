import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { transformLandmarksToViewport } from '../utils'
import type { RenderTask } from '../types'

/**
 * Debug render task: Show face mesh with vertex indices
 * Useful for understanding the face landmark topology and finding specific vertices
 * 
 * Face landmark regions:
 * - 0-16: Face oval (jawline)
 * - 17-26: Right eyebrow
 * - 27-35: Left eyebrow
 * - 36-47: Eyes
 * - 48-67: Lips
 * - 468-477: Left iris
 * - 473-482: Right iris
 */
export const faceMeshIndicesTask: RenderTask = ({
  drawer,
  ctx,
  faceResult,
  mirrored,
  viewport,
  width,
  height,
}) => {
  if (!faceResult?.faceLandmarks?.length) return

  for (const landmarks of faceResult.faceLandmarks) {
    const transformed = transformLandmarksToViewport(
      landmarks,
      viewport,
      width,
      height,
      mirrored,
    )

    // Draw the base tesselation mesh (very subtle)
    drawer.drawConnectors(
      transformed,
      FaceLandmarker.FACE_LANDMARKS_TESSELATION,
      {
        color: 'rgba(255, 255, 255, 0.08)',
        lineWidth: 0.5,
      },
    )

    // Draw contours for reference
    drawer.drawConnectors(
      transformed,
      FaceLandmarker.FACE_LANDMARKS_CONTOURS,
      {
        color: 'rgba(0, 255, 255, 0.3)',
        lineWidth: 1,
      },
    )

    // Draw small circles at each vertex
    drawer.drawLandmarks(transformed, {
      radius: (data) => {
        // Make certain key landmarks bigger
        const keyLandmarks = [0, 17, 61, 291, 199] // Nose tip, etc.
        return keyLandmarks.includes(data.index ?? -1) ? 2 : 1
      },
      color: (data) => {
        const idx = data.index ?? 0
        // Color code by region for easier identification
        if (idx >= 468) return 'rgba(0, 255, 255, 0.8)' // Iris - cyan
        if (idx >= 48 && idx <= 67) return 'rgba(255, 0, 255, 0.8)' // Lips - magenta
        if (idx >= 36 && idx <= 47) return 'rgba(255, 255, 0, 0.8)' // Eyes - yellow
        if (idx >= 17 && idx <= 35) return 'rgba(0, 255, 0, 0.8)' // Eyebrows - green
        return 'rgba(255, 255, 255, 0.6)' // Rest - white
      },
      fillColor: (data) => {
        const idx = data.index ?? 0
        if (idx >= 468) return 'rgba(0, 255, 255, 0.3)'
        if (idx >= 48 && idx <= 67) return 'rgba(255, 0, 255, 0.3)'
        if (idx >= 36 && idx <= 47) return 'rgba(255, 255, 0, 0.3)'
        if (idx >= 17 && idx <= 35) return 'rgba(0, 255, 0, 0.3)'
        return 'rgba(255, 255, 255, 0.2)'
      },
    })

    // Draw index numbers
    ctx.save()
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'
    ctx.shadowBlur = 3
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1

    transformed.forEach((landmark, index) => {
      const x = landmark.x * width
      const y = landmark.y * height

      // Color code text to match the landmark colors
      if (index >= 468) {
        ctx.fillStyle = '#00ffff' // Iris
      } else if (index >= 48 && index <= 67) {
        ctx.fillStyle = '#ff00ff' // Lips
      } else if (index >= 36 && index <= 47) {
        ctx.fillStyle = '#ffff00' // Eyes
      } else if (index >= 17 && index <= 35) {
        ctx.fillStyle = '#00ff00' // Eyebrows
      } else {
        ctx.fillStyle = '#ffffff' // Rest
      }

      // Draw index slightly offset from the point
      // Offset more for key landmarks to avoid overlap
      const offset = [0, 17, 61, 291, 199].includes(index) ? 4 : 3
      ctx.fillText(index.toString(), x + offset, y - offset)
    })

    ctx.restore()
  }
}


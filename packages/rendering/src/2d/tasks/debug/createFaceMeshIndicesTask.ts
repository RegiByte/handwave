import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { transformLandmarksToViewport } from '@handwave/mediapipe'
import type { RenderTask } from '@handwave/mediapipe'

/**
 * Face Mesh Indices Configuration
 */
export type FaceMeshIndicesConfig = {
  fontSize?: number
  showConnections?: boolean
  highlightRegions?: Array<'eyes' | 'lips' | 'contours'>
}

/**
 * Create Face Mesh Indices Render Task
 * 
 * Shows face mesh with vertex indices.
 * Useful for understanding the face landmark topology and finding specific vertices.
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
export const createFaceMeshIndicesTask = (
  config?: FaceMeshIndicesConfig
): RenderTask => {
  const fontSize = config?.fontSize ?? 8
  const showConnections = config?.showConnections ?? true
  const highlightRegions = config?.highlightRegions ?? ['eyes', 'lips', 'contours']

  return ({ drawer, ctx, faceResult, mirrored, viewport, width, height }) => {
    if (!faceResult?.faceLandmarks?.length) return

    for (const landmarks of faceResult.faceLandmarks) {
      const transformed = transformLandmarksToViewport(
        landmarks,
        viewport,
        width,
        height,
        mirrored,
      )

      // Draw the base tesselation mesh if enabled
      if (showConnections) {
        drawer.drawConnectors(
          transformed,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          {
            color: 'rgba(255, 255, 255, 0.08)',
            lineWidth: 0.5,
          },
        )

        // Draw highlighted regions
        if (highlightRegions.includes('contours')) {
          drawer.drawConnectors(
            transformed,
            FaceLandmarker.FACE_LANDMARKS_CONTOURS,
            {
              color: 'rgba(0, 255, 255, 0.3)',
              lineWidth: 1,
            },
          )
        }

        if (highlightRegions.includes('eyes')) {
          drawer.drawConnectors(
            transformed,
            FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
            {
              color: 'rgba(255, 255, 0, 0.5)',
              lineWidth: 1.5,
            },
          )
          drawer.drawConnectors(
            transformed,
            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
            {
              color: 'rgba(255, 255, 0, 0.5)',
              lineWidth: 1.5,
            },
          )
        }

        if (highlightRegions.includes('lips')) {
          drawer.drawConnectors(
            transformed,
            FaceLandmarker.FACE_LANDMARKS_LIPS,
            {
              color: 'rgba(255, 100, 100, 0.5)',
              lineWidth: 1.5,
            },
          )
        }
      }

      // Draw landmark indices (every 10th landmark to avoid clutter)
      ctx.font = `${fontSize}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 2

      landmarks.forEach((_landmark, i) => {
        // Only show every 10th landmark, plus key landmarks
        const isKeyLandmark = [0, 1, 10, 152, 33, 133, 263, 362, 61, 291].includes(i)
        const isMultipleOfTen = i % 10 === 0

        if (isKeyLandmark || isMultipleOfTen) {
          const pos = {
            x: (transformed[i].x * width),
            y: (transformed[i].y * height),
          }

          // Color code: key landmarks in cyan, others in white
          ctx.fillStyle = isKeyLandmark ? '#00FFFF' : 'rgba(255,255,255,0.6)'
          ctx.fillText(`${i}`, pos.x, pos.y)
        }
      })

      ctx.shadowBlur = 0
      ctx.textAlign = 'start'
    }
  }
}

import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { hexToRgba } from '../../lib/colors'
import { remap } from '../../lib/weightedMath'
import type { RenderTask } from './types'
import { transformLandmarksToViewport } from './utils'

/**
 * Render task: Psychedelic smile echo effect with arc formation
 * When smiling, ghost faces appear in an arc around the main face
 * Left smile controls left ghost, right smile controls right ghost
 * Ghosts are rotated to follow the arc like \ | /
 */
export const smileOverlayTask: RenderTask = ({
  drawer,
  faceResult,
  mirrored,
  viewport,
  width,
  height,
}) => {
  if (
    !faceResult?.faceBlendshapes?.length ||
    !faceResult?.faceLandmarks?.length
  )
    return

  const blendshapes = faceResult.faceBlendshapes[0]?.categories ?? []
  const smileLeft =
    blendshapes.find((b) => b.categoryName === 'mouthSmileLeft')?.score ?? 0
  const smileRight =
    blendshapes.find((b) => b.categoryName === 'mouthSmileRight')?.score ?? 0

  // Only activate when smiling
  const smileThreshold = 0.3
  if (smileLeft < smileThreshold && smileRight < smileThreshold) return

  const landmarks = faceResult.faceLandmarks[0]
  if (!landmarks) return

  // Transform original landmarks
  const transformed = transformLandmarksToViewport(
    landmarks,
    viewport,
    width,
    height,
    mirrored,
  )

  // Calculate face center (nose tip landmark index 1)
  const faceCenter = transformed[1] || transformed[0]

  // Arc configuration
  const arcRadius = 0.3 // Distance from center to ghost faces

  // Angles in radians (0 = right, -π/2 = up, π = left)
  // We want: left ghost at ~-2π/3 (upper-left), center at -π/2 (up), right at ~-π/3 (upper-right)
  const centerAngle = -Math.PI / 2 // Straight up (12 o'clock)
  const leftAngle = (-2 * Math.PI) / 3 // Upper-left (10 o'clock)
  const rightAngle = -Math.PI / 3 // Upper-right (2 o'clock)

  // Draw left smile ghost (upper-left position)
  if (smileLeft > smileThreshold) {
    // Interpolate from center toward left position
    const angle = remap(
      smileLeft,
      smileThreshold,
      1.0,
      centerAngle - 0.1,
      leftAngle,
      true,
    )
    const distance = remap(
      smileLeft,
      smileThreshold,
      1.0,
      0.15,
      arcRadius,
      true,
    )
    const opacity = remap(smileLeft, smileThreshold, 1.0, 0.2, 0.6, true)
    // Y-offset to bring the ghost closer to main face's horizontal plane
    const yOffset = 0.2 // Push down to align more horizontally
    const xOffset = 0.1 // Push right to align more horizontally

    drawGhostFaceOnArc(
      drawer,
      transformed,
      faceCenter,
      angle,
      distance,
      '#ff00ff', // Magenta
      opacity,
      yOffset,
      xOffset,
    )
  }

  // Draw right smile ghost (upper-right position)
  if (smileRight > smileThreshold) {
    // Interpolate from center toward right position
    const angle = remap(
      smileRight,
      smileThreshold,
      1.0,
      centerAngle + 0.1,
      rightAngle,
      true,
    )
    const distance = remap(
      smileRight,
      smileThreshold,
      1.0,
      0.15,
      arcRadius,
      true,
    )
    const opacity = remap(smileRight, smileThreshold, 1.0, 0.2, 0.6, true)
    // Y-offset to bring the ghost closer to main face's horizontal plane
    const yOffset = 0.2 // Push down to align more horizontally
    const xOffset = -0.1 // Push left to align more horizontally

    drawGhostFaceOnArc(
      drawer,
      transformed,
      faceCenter,
      angle,
      distance,
      '#00ffff', // Cyan
      opacity,
      yOffset,
      xOffset,
    )
  }

  // Draw center ghost when both smiling strongly (straight up at 12 o'clock)
  const avgSmile = (smileLeft + smileRight) / 2
  if (avgSmile > 0.7) {
    const angle = centerAngle // Straight up
    const distance = remap(avgSmile, 0.7, 1.0, 0.2, arcRadius * 1.2, true)
    const opacity = remap(avgSmile, 0.7, 1.0, 0.2, 0.5, true)

    drawGhostFaceOnArc(
      drawer,
      transformed,
      faceCenter,
      angle,
      distance,
      '#ffff00', // Yellow
      opacity,
      0, // No Y-offset for center ghost
      0, // No X-offset for center ghost
    )
  }
}

/**
 * Helper: Draw a ghost face positioned on an arc with rotation
 * @param drawer - MediaPipe DrawingUtils
 * @param landmarks - Original face landmarks
 * @param _center - Center point of the face (anchor for arc) - reserved for future use
 * @param angle - Angle on the arc (radians, 0 = right, -π/2 = up, π = left)
 * @param distance - Distance from center along the arc
 * @param color - Ghost face color
 * @param opacity - Base opacity for the ghost
 * @param yOffset - Additional Y offset to adjust vertical position (default 0)
 */
function drawGhostFaceOnArc(
  drawer: any,
  landmarks: Array<{ x: number; y: number; z: number; visibility: number }>,
  _center: { x: number; y: number; z: number },
  angle: number,
  distance: number,
  color: string,
  opacity: number,
  yOffset: number = 0,
  xOffset: number = 0,
) {
  // Calculate position on arc
  const offsetX = Math.cos(angle) * distance - xOffset
  const offsetY = Math.sin(angle) * distance + yOffset

  // Calculate face center for rotation
  const faceCenterX =
    landmarks.reduce((sum, lm) => sum + lm.x, 0) / landmarks.length
  const faceCenterY =
    landmarks.reduce((sum, lm) => sum + lm.y, 0) / landmarks.length

  // Create rotated and positioned landmarks
  // Rotation angle follows the arc tangent (perpendicular to radius)
  const rotationAngle = angle + Math.PI / 2 // Tangent to the arc

  const ghostLandmarks = landmarks.map((lm) => {
    // Translate to origin (relative to face center)
    const relX = lm.x - faceCenterX
    const relY = lm.y - faceCenterY

    // Rotate around face center
    const rotatedX =
      relX * Math.cos(rotationAngle) - relY * Math.sin(rotationAngle)
    const rotatedY =
      relX * Math.sin(rotationAngle) + relY * Math.cos(rotationAngle)

    // Translate back and apply arc offset
    return {
      x: rotatedX + faceCenterX + offsetX,
      y: rotatedY + faceCenterY + offsetY,
      z: lm.z,
      visibility: lm.visibility,
    }
  })

  // Draw ghost face contours
  drawer.drawConnectors(
    ghostLandmarks,
    FaceLandmarker.FACE_LANDMARKS_CONTOURS,
    {
      color: hexToRgba(color, opacity * 0.6),
      lineWidth: 2,
    },
  )

  // Draw ghost face tesselation (subtle)
  drawer.drawConnectors(
    ghostLandmarks,
    FaceLandmarker.FACE_LANDMARKS_TESSELATION,
    {
      color: hexToRgba(color, opacity * 0.2),
      lineWidth: 0.5,
    },
  )

  // Draw ghost eyes (more visible)
  drawer.drawConnectors(
    ghostLandmarks,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    {
      color: hexToRgba(color, opacity * 0.8),
      lineWidth: 2,
    },
  )

  drawer.drawConnectors(
    ghostLandmarks,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    {
      color: hexToRgba(color, opacity * 0.8),
      lineWidth: 2,
    },
  )

  // Draw ghost mouth (most visible)
  drawer.drawConnectors(ghostLandmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, {
    color: hexToRgba(color, opacity),
    lineWidth: 2,
  })
}

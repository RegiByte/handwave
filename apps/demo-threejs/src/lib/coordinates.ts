/**
 * Coordinate Transformation Utilities for Three.js
 *
 * Handles transformation between coordinate systems:
 * 1. MediaPipe normalized space [0, 1]
 * 2. Video element space (actual video resolution)
 * 3. Canvas/viewport space (displayed size with letterboxing)
 * 4. Three.js world space (arbitrary units)
 *
 * Philosophy: Pure functions, clear semantics, composable transforms.
 */

import type { Camera } from 'three'
import { Vector3 } from 'three'

/**
 * Position in normalized space [0, 1]
 */
export interface NormalizedPosition {
  x: number
  y: number
  z: number
}

/**
 * Position in Three.js world space
 */
export interface WorldPosition {
  x: number
  y: number
  z: number
}

/**
 * Viewport configuration
 */
export interface ViewportConfig {
  width: number
  height: number
  videoWidth: number
  videoHeight: number
}

/**
 * Calculate letterboxing/pillarboxing offsets
 * 
 * When video aspect ratio doesn't match viewport aspect ratio,
 * the video is scaled to fit and centered, creating black bars.
 * 
 * Returns the effective video display area within the viewport.
 */
export function calculateVideoDisplayArea(viewport: ViewportConfig): {
  x: number
  y: number
  width: number
  height: number
  scale: number
} {
  const viewportAspect = viewport.width / viewport.height
  const videoAspect = viewport.videoWidth / viewport.videoHeight

  let displayWidth: number
  let displayHeight: number
  let offsetX: number
  let offsetY: number
  let scale: number

  if (videoAspect > viewportAspect) {
    // Video is wider - pillarboxing (black bars on top/bottom)
    displayWidth = viewport.width
    displayHeight = viewport.width / videoAspect
    offsetX = 0
    offsetY = (viewport.height - displayHeight) / 2
    scale = displayWidth / viewport.videoWidth
  } else {
    // Video is taller - letterboxing (black bars on left/right)
    displayHeight = viewport.height
    displayWidth = viewport.height * videoAspect
    offsetX = (viewport.width - displayWidth) / 2
    offsetY = 0
    scale = displayHeight / viewport.videoHeight
  }

  return {
    x: offsetX,
    y: offsetY,
    width: displayWidth,
    height: displayHeight,
    scale,
  }
}

/**
 * Transform normalized MediaPipe coordinates to Three.js world space
 * 
 * Accounts for video aspect ratio vs viewport aspect ratio.
 * The video maintains its aspect ratio and may have letterboxing/pillarboxing.
 * 
 * @param normalized - MediaPipe normalized position
 * @param viewport - Viewport configuration
 * @param camera - Three.js camera (must be PerspectiveCamera)
 * @param mirrored - Whether video is mirrored (selfie mode)
 * @param planeDistance - Distance of the mapping plane from camera (default: 10, matching camera z position)
 * @returns Position in Three.js world space
 */
export function normalizedToWorld(
  normalized: NormalizedPosition,
  viewport: ViewportConfig,
  camera: any, // PerspectiveCamera
  mirrored: boolean = true,
  planeDistance: number = 10
): WorldPosition {
  // Apply mirroring in normalized space
  const x = mirrored ? 1 - normalized.x : normalized.x
  const y = normalized.y

  // Calculate the visible area at the plane distance
  // For a perspective camera: visibleHeight = 2 * tan(fov/2) * distance
  const fovRadians = (camera.fov * Math.PI) / 180
  const visibleHeight = 2 * Math.tan(fovRadians / 2) * planeDistance
  const visibleWidth = visibleHeight * camera.aspect

  // Calculate video display area (accounting for letterboxing/pillarboxing)
  const displayArea = calculateVideoDisplayArea(viewport)
  
  // Calculate the scale factor between video display and full viewport
  const scaleX = displayArea.width / viewport.width
  const scaleY = displayArea.height / viewport.height
  
  // Calculate offset from center due to letterboxing/pillarboxing
  const offsetX = (displayArea.x - viewport.width / 2 + displayArea.width / 2) / viewport.width
  const offsetY = (displayArea.y - viewport.height / 2 + displayArea.height / 2) / viewport.height

  // Map normalized [0, 1] to world space, accounting for video display area
  const worldX = ((x - 0.5) * scaleX + offsetX) * visibleWidth
  const worldY = ((0.5 - y) * scaleY - offsetY) * visibleHeight // Flip Y (screen Y down, world Y up)
  
  // Z position: start at plane, then offset by MediaPipe depth
  const worldZ = -planeDistance + camera.position.z + (normalized.z * 2)

  return {
    x: worldX,
    y: worldY,
    z: worldZ,
  }
}

/**
 * Simplified world space mapping (legacy approach)
 * 
 * Maps normalized coordinates to a fixed [-5, 5] world space.
 * This doesn't account for camera projection or letterboxing.
 * 
 * @deprecated Use normalizedToWorld for proper projection
 */
export function normalizedToWorldSimple(
  normalized: NormalizedPosition,
  mirrored: boolean = true
): WorldPosition {
  const worldX = mirrored 
    ? (1 - normalized.x) * 10 - 5
    : normalized.x * 10 - 5
  
  const worldY = (1 - normalized.y) * 10 - 5
  const worldZ = normalized.z * 2
  
  return { x: worldX, y: worldY, z: worldZ }
}

/**
 * Get viewport configuration from video element and canvas
 */
export function getViewportConfig(
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement
): ViewportConfig {
  return {
    width: canvasElement.width,
    height: canvasElement.height,
    videoWidth: videoElement.videoWidth || 1280,
    videoHeight: videoElement.videoHeight || 720,
  }
}

/**
 * Calculate scale factor for 3D objects to match video display area
 * 
 * Returns a scale factor that accounts for letterboxing/pillarboxing.
 * Use this to scale 3D objects so they maintain consistent size relative to the video.
 * 
 * @param viewport - Viewport configuration
 * @returns Scale factor (1.0 = no scaling, <1.0 = scale down, >1.0 = scale up)
 */
export function getVideoDisplayScale(viewport: ViewportConfig): number {
  const displayArea = calculateVideoDisplayArea(viewport)
  
  // Use the smaller dimension to ensure objects fit within video display
  const scaleX = displayArea.width / viewport.width
  const scaleY = displayArea.height / viewport.height
  
  // Return the minimum scale to ensure objects stay within video bounds
  return Math.min(scaleX, scaleY)
}

/**
 * Calculate pinch center in world space
 * 
 * Returns the midpoint between thumb tip and index finger tip,
 * transformed to Three.js world space.
 * 
 * @param hand - Hand detection data with landmarks
 * @param viewport - Viewport configuration
 * @param camera - Three.js camera
 * @param mirrored - Whether video is mirrored
 * @param planeDistance - Distance of mapping plane from camera
 * @returns Pinch center position in world space
 */
export function getPinchCenter(
  hand: { landmarks: Array<{ x: number; y: number; z: number }> },
  viewport: ViewportConfig,
  camera: Camera,
  mirrored: boolean,
  planeDistance: number
): Vector3 {
  const thumbTip = hand.landmarks[4]  // Thumb tip
  const indexTip = hand.landmarks[8]  // Index tip
  
  // Calculate midpoint in normalized space
  const center = {
    x: (thumbTip.x + indexTip.x) / 2,
    y: (thumbTip.y + indexTip.y) / 2,
    z: (thumbTip.z + indexTip.z) / 2,
  }
  
  // Transform to world space
  const worldPos = normalizedToWorld(center, viewport, camera, mirrored, planeDistance)
  
  return new Vector3(worldPos.x, worldPos.y, worldPos.z)
}

/**
 * Project 3D world coordinates to 2D screen coordinates
 * 
 * Converts a position in Three.js world space to screen pixel coordinates.
 * Useful for positioning HTML overlays on top of 3D objects.
 * 
 * @param worldPos - Position in world space
 * @param camera - Three.js camera
 * @param viewport - Viewport configuration
 * @returns Screen coordinates in pixels
 */
export function projectToScreen(
  worldPos: Vector3 | WorldPosition,
  camera: Camera,
  viewport: ViewportConfig
): { x: number; y: number } {
  // Create Vector3 if needed
  const vector = worldPos instanceof Vector3 
    ? worldPos.clone() 
    : new Vector3(worldPos.x, worldPos.y, worldPos.z)
  
  // Project to normalized device coordinates [-1, 1]
  vector.project(camera)
  
  // Convert from NDC [-1, 1] to screen pixels [0, width/height]
  return {
    x: (vector.x * 0.5 + 0.5) * viewport.width,
    y: (-vector.y * 0.5 + 0.5) * viewport.height,
  }
}

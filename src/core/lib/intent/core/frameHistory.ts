/**
 * Intent Engine - Frame History
 *
 * Ring buffer for storing the last N frames to enable temporal logic.
 *
 * Responsibilities:
 * - Store last N frames in a ring buffer
 * - Provide temporal query functions (ago, window, heldFor)
 * - Calculate velocities between frames
 * - Pure functions only (no side effects)
 *
 * Philosophy:
 * - Frame history enables temporal queries without state machines
 * - Simple array operations, no complex data structures
 * - All functions are pure and testable
 */

import type { FrameSnapshot, Vector3 } from './types'

// ============================================================================
// Frame History Management
// ============================================================================

/**
 * Add a frame to the history (ring buffer)
 *
 * @param frames - Current frame history
 * @param newFrame - New frame to add
 * @param maxSize - Maximum number of frames to keep
 * @returns New frame history (immutable)
 */
export function addFrame(
  frames: Array<FrameSnapshot>,
  newFrame: FrameSnapshot,
  maxSize: number
): Array<FrameSnapshot> {
  const updated = [...frames, newFrame]
  return updated.length > maxSize ? updated.slice(-maxSize) : updated
}

/**
 * Get the most recent frame
 *
 * @param frames - Frame history
 * @returns Most recent frame or null if empty
 */
export function getLatestFrame(
  frames: Array<FrameSnapshot>
): FrameSnapshot | null {
  return frames.length > 0 ? frames[frames.length - 1] : null
}

/**
 * Get a frame N frames ago
 *
 * @param frames - Frame history
 * @param n - Number of frames ago (0 = latest, 1 = previous, etc.)
 * @returns Frame or null if not available
 */
export function getFrameAgo(
  frames: Array<FrameSnapshot>,
  n: number
): FrameSnapshot | null {
  const index = frames.length - 1 - n
  return index >= 0 ? frames[index] : null
}

/**
 * Get all frames within a time window
 *
 * @param frames - Frame history
 * @param durationMs - Duration in milliseconds
 * @returns Frames within the window (oldest to newest)
 */
export function getFramesInWindow(
  frames: Array<FrameSnapshot>,
  durationMs: number
): Array<FrameSnapshot> {
  if (frames.length === 0) return []

  const latestTime = frames[frames.length - 1].timestamp
  const cutoffTime = latestTime - durationMs

  return frames.filter((frame) => frame.timestamp >= cutoffTime)
}

// ============================================================================
// Temporal Queries
// ============================================================================

/**
 * Check if a condition has been held for a duration
 *
 * @param frames - Frame history
 * @param durationMs - Duration in milliseconds
 * @param predicate - Condition to check for each frame
 * @returns True if condition held for entire duration
 */
export function checkHeldFor(
  frames: Array<FrameSnapshot>,
  durationMs: number,
  predicate: (frame: FrameSnapshot) => boolean
): boolean {
  if (frames.length === 0) return false
  const latestTime = frames[frames.length - 1].timestamp
  const cutoffTime = latestTime - durationMs
  const window = getFramesInWindow(frames, durationMs)

  // Need at least some frames in the window
  if (window.length === 0) return false

  // If we don't have frames covering the full duration, treat as not held
  if (window[0].timestamp > cutoffTime) return false

  // Check if all frames in window satisfy predicate
  return window.every(predicate)
}

/**
 * Check if a condition was true at any point in a time window
 *
 * @param frames - Frame history
 * @param durationMs - Duration in milliseconds
 * @param predicate - Condition to check
 * @returns True if condition was true at any point
 */
export function checkAnyInWindow(
  frames: Array<FrameSnapshot>,
  durationMs: number,
  predicate: (frame: FrameSnapshot) => boolean
): boolean {
  const window = getFramesInWindow(frames, durationMs)
  return window.some(predicate)
}

/**
 * Get the duration a condition has been continuously true
 *
 * @param frames - Frame history
 * @param predicate - Condition to check
 * @returns Duration in milliseconds (0 if not currently true)
 */
export function getContinuousDuration(
  frames: Array<FrameSnapshot>,
  predicate: (frame: FrameSnapshot) => boolean
): number {
  if (frames.length === 0) return 0

  // Start from the end and work backwards
  let startIndex = frames.length - 1

  // Check if current frame satisfies predicate
  if (!predicate(frames[startIndex])) return 0

  // Find where the continuous sequence started
  while (startIndex > 0 && predicate(frames[startIndex - 1])) {
    startIndex--
  }

  // Calculate duration
  const startTime = frames[startIndex].timestamp
  const endTime = frames[frames.length - 1].timestamp

  return endTime - startTime
}

// ============================================================================
// Velocity Calculations
// ============================================================================

/**
 * Calculate velocity between two frames for a specific landmark
 *
 * @param current - Current frame
 * @param previous - Previous frame
 * @param getLandmark - Function to extract landmark from frame
 * @returns Velocity vector (units per second) or null if landmarks missing
 */
export function calculateVelocity(
  current: FrameSnapshot,
  previous: FrameSnapshot,
  getLandmark: (frame: FrameSnapshot) => Vector3 | null
): Vector3 | null {
  const currentLandmark = getLandmark(current)
  const previousLandmark = getLandmark(previous)

  if (!currentLandmark || !previousLandmark) return null

  const dt = (current.timestamp - previous.timestamp) / 1000 // Convert to seconds

  if (dt === 0) return { x: 0, y: 0, z: 0 }

  return {
    x: (currentLandmark.x - previousLandmark.x) / dt,
    y: (currentLandmark.y - previousLandmark.y) / dt,
    z: (currentLandmark.z - previousLandmark.z) / dt,
  }
}

/**
 * Calculate average velocity over a time window
 *
 * @param frames - Frame history
 * @param durationMs - Duration in milliseconds
 * @param getLandmark - Function to extract landmark from frame
 * @returns Average velocity or null if insufficient data
 */
export function calculateAverageVelocity(
  frames: Array<FrameSnapshot>,
  durationMs: number,
  getLandmark: (frame: FrameSnapshot) => Vector3 | null
): Vector3 | null {
  const window = getFramesInWindow(frames, durationMs)

  if (window.length < 2) return null

  const velocities: Array<Vector3> = []

  for (let i = 1; i < window.length; i++) {
    const velocity = calculateVelocity(window[i], window[i - 1], getLandmark)
    if (velocity) velocities.push(velocity)
  }

  if (velocities.length === 0) return null

  // Calculate average
  const sum = velocities.reduce(
    (acc, v) => ({
      x: acc.x + v.x,
      y: acc.y + v.y,
      z: acc.z + v.z,
    }),
    { x: 0, y: 0, z: 0 }
  )

  return {
    x: sum.x / velocities.length,
    y: sum.y / velocities.length,
    z: sum.z / velocities.length,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the time span of the frame history
 *
 * @param frames - Frame history
 * @returns Duration in milliseconds or 0 if empty
 */
export function getHistoryDuration(frames: Array<FrameSnapshot>): number {
  if (frames.length < 2) return 0
  return frames[frames.length - 1].timestamp - frames[0].timestamp
}

/**
 * Get the average frame rate of the history
 *
 * @param frames - Frame history
 * @returns FPS or 0 if insufficient data
 */
export function getAverageFPS(frames: Array<FrameSnapshot>): number {
  if (frames.length < 2) return 0

  const duration = getHistoryDuration(frames)
  if (duration === 0) return 0

  return ((frames.length - 1) / duration) * 1000
}


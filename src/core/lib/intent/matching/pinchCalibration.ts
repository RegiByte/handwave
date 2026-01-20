/**
 * Pinch Calibration System
 *
 * Empirically-derived pinch distance thresholds from real recordings.
 * Each finger has its own biomechanical characteristics that affect
 * the minimum achievable distance to thumb and variance during pinch.
 *
 * This module provides per-finger thresholds based on real-world data analysis.
 *
 * Data Sources:
 * - contact-index-to-thumb.json (300 frames)
 * - contact-middle-to-thumb.json (300 frames)
 * - contact-ring-to-thumb.json (300 frames)
 * - contact-pinky-to-thumb.json (300 frames)
 */

// ============================================================================
// Types
// ============================================================================

export type FingerName = 'index' | 'middle' | 'ring' | 'pinky'

export interface PinchCalibration {
  /** Finger name */
  finger: FingerName
  /** Observed minimum distance in real data (tightest pinch) */
  observedMin: number
  /** Observed maximum distance in real data (fingers apart) */
  observedMax: number
  /** Mean distance from real data */
  observedMean: number
  /** Standard deviation from real data */
  observedStdDev: number
  /** Minimum threshold - very tight, requires near-perfect contact */
  minThreshold: number
  /** Recommended threshold - reliable for most users */
  recommendedThreshold: number
  /** Relaxed threshold - very forgiving, good for accessibility */
  relaxedThreshold: number
  /** Notes about this finger's pinch behavior */
  notes?: string
}

// ============================================================================
// Calibration Data (from real recordings)
// ============================================================================

/**
 * Pinch calibration data derived from actual recordings.
 *
 * Key insights from data analysis:
 * - Index finger is most reliable (tight biomechanical coupling with thumb)
 * - Middle finger is second best (good precision)
 * - Ring finger has highest variance (least independent finger)
 * - Pinky has limited range of motion but moderate precision
 *
 * Threshold philosophy:
 * - minThreshold: ~1.5x observed minimum (tight, for precise control)
 * - recommendedThreshold: Covers majority of "pinch intended" frames
 * - relaxedThreshold: Very forgiving, for accessibility
 */
export const PINCH_CALIBRATIONS: Record<FingerName, PinchCalibration> = {
  index: {
    finger: 'index',
    observedMin: 0.0205,
    observedMax: 0.2486,
    observedMean: 0.0974,
    observedStdDev: 0.081,
    minThreshold: 0.043, // ~2x min, tight control
    recommendedThreshold: 0.06, // Reliable for most users
    relaxedThreshold: 0.08, // Very forgiving
    notes:
      'Most reliable pinch. Tight biomechanical coupling with thumb. Lowest minimum distance.',
  },

  middle: {
    finger: 'middle',
    observedMin: 0.0245,
    observedMax: 0.2577,
    observedMean: 0.0853,
    observedStdDev: 0.0513,
    minThreshold: 0.037, // ~1.5x min
    recommendedThreshold: 0.062, // Reliable
    relaxedThreshold: 0.075, // Forgiving
    notes:
      'Second most reliable pinch. Good precision. Similar performance to index.',
  },

  ring: {
    finger: 'ring',
    observedMin: 0.004, // Very low, but unstable!
    observedMax: 0.2403,
    observedMean: 0.0909,
    observedStdDev: 0.0699, // Highest variance!
    minThreshold: 0.06, // Much higher due to instability
    recommendedThreshold: 0.09, // Needs loose threshold
    relaxedThreshold: 0.12, // Very loose for reliability
    notes:
      'Least independent finger. Highest variance (0.07 std dev). Needs loose threshold for reliability.',
  },

  pinky: {
    finger: 'pinky',
    observedMin: 0.0357,
    observedMax: 0.3081,
    observedMean: 0.0769,
    observedStdDev: 0.0531,
    minThreshold: 0.054, // ~1.5x min
    recommendedThreshold: 0.075, // Moderate threshold
    relaxedThreshold: 0.1, // Forgiving
    notes:
      'Limited range of motion. Moderate precision. Hardest finger to bring to thumb.',
  },
}

// ============================================================================
// Threshold Functions
// ============================================================================

/**
 * Get the recommended threshold for a finger.
 *
 * @param finger - Finger name
 * @returns Recommended threshold for reliable detection
 *
 * @example
 * ```ts
 * const threshold = getPinchThreshold('index')
 * // Returns 0.06
 * ```
 */
export function getPinchThreshold(finger: FingerName): number {
  const calibration = PINCH_CALIBRATIONS[finger]
  return calibration?.recommendedThreshold ?? 0.07 // Fallback
}

/**
 * Get all thresholds for a finger (min, recommended, relaxed).
 *
 * @param finger - Finger name
 * @returns Object with all threshold levels
 *
 * @example
 * ```ts
 * const thresholds = getAllPinchThresholds('ring')
 * // Returns { min: 0.06, recommended: 0.09, relaxed: 0.12 }
 * ```
 */
export function getAllPinchThresholds(finger: FingerName): {
  min: number
  recommended: number
  relaxed: number
} {
  const calibration = PINCH_CALIBRATIONS[finger]
  if (!calibration) {
    return { min: 0.05, recommended: 0.07, relaxed: 0.1 }
  }
  return {
    min: calibration.minThreshold,
    recommended: calibration.recommendedThreshold,
    relaxed: calibration.relaxedThreshold,
  }
}

/**
 * Get calibration data for a finger (if available).
 *
 * @param finger - Finger name
 * @returns Calibration data or null
 */
export function getPinchCalibration(
  finger: FingerName,
): PinchCalibration | null {
  return PINCH_CALIBRATIONS[finger] ?? null
}

/**
 * Get all pinch calibrations.
 *
 * @returns Copy of all calibration data
 */
export function getAllPinchCalibrations(): Record<FingerName, PinchCalibration> {
  return { ...PINCH_CALIBRATIONS }
}

/**
 * Check if a distance meets the pinch threshold.
 *
 * @param finger - Finger name
 * @param distance - Measured distance between finger and thumb
 * @param threshold - Optional custom threshold (uses recommended if not provided)
 * @returns True if distance is below threshold (pinch detected)
 *
 * @example
 * ```ts
 * const isPinching = meetsPinchThreshold('index', 0.045)
 * // Returns true (0.045 < 0.06 recommended threshold)
 * ```
 */
export function meetsPinchThreshold(
  finger: FingerName,
  distance: number,
  threshold?: number,
): boolean {
  const effectiveThreshold = threshold ?? getPinchThreshold(finger)
  return distance <= effectiveThreshold
}

/**
 * Normalize a pinch distance to 0-1 scale based on calibration data.
 *
 * Useful for visualizations or continuous feedback (like pinch "pressure").
 *
 * @param finger - Finger name
 * @param distance - Measured distance
 * @returns Normalized value (0 = tight pinch, 1 = fingers apart)
 *
 * @example
 * ```ts
 * const normalized = normalizePinchDistance('index', 0.05)
 * // Returns ~0.13 (close to minimum)
 * ```
 */
export function normalizePinchDistance(
  finger: FingerName,
  distance: number,
): number {
  const calibration = PINCH_CALIBRATIONS[finger]
  if (!calibration) {
    // Fallback: assume 0-0.3 range
    return Math.max(0, Math.min(1, distance / 0.3))
  }

  const range = calibration.observedMax - calibration.observedMin
  const normalized = (distance - calibration.observedMin) / range

  return Math.max(0, Math.min(1, normalized))
}

/**
 * Get pinch quality level based on distance.
 *
 * @param finger - Finger name
 * @param distance - Measured distance
 * @returns Quality level: 'tight', 'normal', 'loose', or 'none'
 */
export function getPinchQuality(
  finger: FingerName,
  distance: number,
): 'tight' | 'normal' | 'loose' | 'none' {
  const calibration = PINCH_CALIBRATIONS[finger]
  if (!calibration) {
    return distance <= 0.05 ? 'tight' : distance <= 0.1 ? 'normal' : 'none'
  }

  if (distance <= calibration.minThreshold) return 'tight'
  if (distance <= calibration.recommendedThreshold) return 'normal'
  if (distance <= calibration.relaxedThreshold) return 'loose'
  return 'none'
}

// ============================================================================
// Default Threshold Configuration
// ============================================================================

/**
 * Default pinch thresholds that can be overridden by users.
 *
 * These are the recommended values from calibration data.
 * Users can provide their own defaults via configuration.
 */
export const DEFAULT_PINCH_THRESHOLDS: Record<FingerName, number> = {
  index: PINCH_CALIBRATIONS.index.recommendedThreshold,
  middle: PINCH_CALIBRATIONS.middle.recommendedThreshold,
  ring: PINCH_CALIBRATIONS.ring.recommendedThreshold,
  pinky: PINCH_CALIBRATIONS.pinky.recommendedThreshold,
}

/**
 * Create a custom threshold configuration by merging with defaults.
 *
 * @param overrides - Partial threshold overrides
 * @returns Complete threshold configuration
 *
 * @example
 * ```ts
 * const myThresholds = createPinchThresholds({ index: 0.05, ring: 0.1 })
 * // Returns { index: 0.05, middle: 0.055, ring: 0.1, pinky: 0.075 }
 * ```
 */
export function createPinchThresholds(
  overrides: Partial<Record<FingerName, number>> = {},
): Record<FingerName, number> {
  return {
    ...DEFAULT_PINCH_THRESHOLDS,
    ...overrides,
  }
}

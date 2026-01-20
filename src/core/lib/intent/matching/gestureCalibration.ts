/**
 * Gesture Calibration System
 *
 * MediaPipe's gesture confidence scores are gesture-specific and need calibration.
 * Each gesture has its own confidence range - what's "high confidence" for one
 * gesture might be "low confidence" for another.
 *
 * This module provides per-gesture thresholds and remapping functions based on
 * real-world data analysis.
 */

// ============================================================================
// Types
// ============================================================================

export interface GestureCalibration {
  /** Gesture name from MediaPipe */
  gesture: string
  /** Observed minimum confidence in real data */
  observedMin: number
  /** Observed maximum confidence in real data */
  observedMax: number
  /** Mean confidence from real data */
  observedMean: number
  /** Standard deviation from real data */
  observedStdDev: number
  /** Minimum threshold for detection (conservative) */
  minThreshold: number
  /** Recommended threshold for reliable detection */
  recommendedThreshold: number
  /** High quality threshold */
  highQualityThreshold: number
  /** Notes about this gesture's behavior */
  notes?: string
}

export interface NormalizedConfidence {
  /** Original raw confidence from MediaPipe */
  raw: number
  /** Normalized confidence (0-1 scale, calibrated per gesture) */
  normalized: number
  /** Quality level based on normalized score */
  quality: 'low' | 'medium' | 'high' | 'excellent'
  /** Whether this meets the recommended threshold */
  meetsThreshold: boolean
}

// ============================================================================
// Calibration Data (from real recordings)
// ============================================================================

/**
 * Gesture calibration data derived from actual recordings.
 *
 * Sources:
 * - recording-session-1768716839044-0b4d3r.json (first recording)
 * - recording-session-1768742302421-edyeyn.json (gesture-focused recording)
 */
export const GESTURE_CALIBRATIONS: Record<string, GestureCalibration> = {
  Victory: {
    gesture: 'Victory',
    observedMin: 0.745,
    observedMax: 0.920,
    observedMean: 0.859,
    observedStdDev: 0.050,
    minThreshold: 0.75, // Conservative: at observed min
    recommendedThreshold: 0.75, // Reliable: mean - 1 std dev
    highQualityThreshold: 0.88, // High quality: near mean + 0.5 std dev
    notes:
      'Excellent gesture! 100% >0.7, 81.3% >0.8, 34.0% >0.9. Very reliable detection.',
  },

  Thumb_Up: {
    gesture: 'Thumb_Up',
    observedMin: 0.585,
    observedMax: 0.785,
    observedMean: 0.717,
    observedStdDev: 0.054,
    minThreshold: 0.60, // Conservative: just above observed min
    recommendedThreshold: 0.6, // Reliable: mean - 1 std dev
    highQualityThreshold: 0.75, // High quality: near max
    notes:
      'Improved with dedicated recording! 56.7% >0.7. Consistent in 0.65-0.75 range.',
  },

  Thumb_Down: {
    gesture: 'Thumb_Down',
    observedMin: 0.558,
    observedMax: 0.982,
    observedMean: 0.898,
    observedStdDev: 0.078,
    minThreshold: 0.70, // Conservative: well above observed min
    recommendedThreshold: 0.82, // Reliable: mean - 1 std dev
    highQualityThreshold: 0.90, // High quality: near mean
    notes:
      'Best gesture! 99.1% >0.7, 78.4% >0.8, 71.6% >0.9. Most reliable detection.',
  },

  Open_Palm: {
    gesture: 'Open_Palm',
    observedMin: 0.574,
    observedMax: 0.787,
    observedMean: 0.680,
    observedStdDev: 0.060,
    minThreshold: 0.60, // Conservative: just above observed min
    recommendedThreshold: 0.65, // Reliable: near mean
    highQualityThreshold: 0.72, // High quality: mean + 1 std dev
    notes:
      'Improved with more data! 45.2% >0.7. Still lower than other gestures but usable at 0.65+',
  },

  Closed_Fist: {
    gesture: 'Closed_Fist',
    observedMin: 0.504,
    observedMax: 0.947,
    observedMean: 0.795,
    observedStdDev: 0.108,
    minThreshold: 0.55, // Conservative: just above observed min
    recommendedThreshold: 0.70, // Reliable: mean - 1 std dev
    highQualityThreshold: 0.80, // High quality: near mean
    notes:
      'Excellent gesture! 82.6% >0.7, 56.8% >0.8, 18.4% >0.9. Much better than initial estimates.',
  },

  None: {
    gesture: 'None',
    observedMin: 0.49,
    observedMax: 0.935,
    observedMean: 0.783, // Average from both recordings
    observedStdDev: 0.15, // Average from both recordings
    minThreshold: 0.5, // Conservative: at observed min
    recommendedThreshold: 0.7, // Reliable: mean - 1 std dev
    highQualityThreshold: 0.85, // High quality: mean + 0.5 std dev
    notes:
      'Default/fallback gesture. Wide range. High confidence during pinches and transitions',
  },

  Pointing_Up: {
    gesture: 'Pointing_Up',
    observedMin: 0.6, // Estimated (needs real data)
    observedMax: 0.85, // Estimated
    observedMean: 0.72, // Estimated
    observedStdDev: 0.06, // Estimated
    minThreshold: 0.6,
    recommendedThreshold: 0.7,
    highQualityThreshold: 0.8,
    notes: 'No data yet. Estimated thresholds. Needs recording session.',
  },
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize a gesture confidence score based on its calibration data.
 *
 * Maps the observed range [min, max] to [0, 1] scale, giving us a
 * gesture-relative confidence score.
 *
 * @example
 * // Open_Palm with 0.62 raw confidence
 * const result = normalizeGestureConfidence('Open_Palm', 0.62)
 * // result.normalized ≈ 0.49 (middle of Open_Palm's range)
 * // result.quality = 'medium'
 *
 * // Victory with 0.85 raw confidence
 * const result = normalizeGestureConfidence('Victory', 0.85)
 * // result.normalized ≈ 0.64 (good within Victory's range)
 * // result.quality = 'high'
 */
export function normalizeGestureConfidence(
  gesture: string,
  rawConfidence: number,
): NormalizedConfidence {
  const calibration = GESTURE_CALIBRATIONS[gesture]

  // If no calibration data, use raw confidence
  if (!calibration) {
    return {
      raw: rawConfidence,
      normalized: rawConfidence,
      quality: getQualityLevel(rawConfidence, rawConfidence),
      meetsThreshold: rawConfidence >= 0.7, // Default threshold
    }
  }

  // Normalize to 0-1 scale based on observed range
  const range = calibration.observedMax - calibration.observedMin
  const normalized = Math.max(
    0,
    Math.min(1, (rawConfidence - calibration.observedMin) / range),
  )

  // Determine quality based on calibration thresholds
  const quality = getQualityLevel(
    rawConfidence,
    calibration.recommendedThreshold,
  )

  // Check if meets recommended threshold
  const meetsThreshold = rawConfidence >= calibration.recommendedThreshold

  return {
    raw: rawConfidence,
    normalized,
    quality,
    meetsThreshold,
  }
}

/**
 * Get quality level for a confidence score
 */
function getQualityLevel(
  confidence: number,
  recommendedThreshold: number,
): 'low' | 'medium' | 'high' | 'excellent' {
  if (confidence >= recommendedThreshold + 0.15) return 'excellent'
  if (confidence >= recommendedThreshold + 0.05) return 'high'
  if (confidence >= recommendedThreshold) return 'medium'
  return 'low'
}

/**
 * Check if a gesture confidence meets the threshold for detection.
 *
 * Uses per-gesture calibrated thresholds instead of a universal threshold.
 *
 * @param gesture - Gesture name from MediaPipe
 * @param rawConfidence - Raw confidence score from MediaPipe
 * @param strictness - 'min' | 'recommended' | 'high' (default: 'recommended')
 */
export function meetsGestureThreshold(
  gesture: string,
  rawConfidence: number,
  strictness: 'min' | 'recommended' | 'high' = 'recommended',
): boolean {
  const calibration = GESTURE_CALIBRATIONS[gesture]

  if (!calibration) {
    // No calibration data, use default threshold
    return rawConfidence >= 0.7
  }

  const threshold =
    strictness === 'min'
      ? calibration.minThreshold
      : strictness === 'high'
        ? calibration.highQualityThreshold
        : calibration.recommendedThreshold

  return rawConfidence >= threshold
}

/**
 * Get the appropriate threshold for a gesture based on strictness level.
 */
export function getGestureThreshold(
  gesture: string,
  strictness: 'min' | 'recommended' | 'high' = 'recommended',
): number {
  const calibration = GESTURE_CALIBRATIONS[gesture]

  if (!calibration) {
    return 0.7 // Default threshold
  }

  switch (strictness) {
    case 'min':
      return calibration.minThreshold
    case 'high':
      return calibration.highQualityThreshold
    default:
      return calibration.recommendedThreshold
  }
}

/**
 * Get calibration data for a gesture (if available)
 */
export function getGestureCalibration(
  gesture: string,
): GestureCalibration | null {
  return GESTURE_CALIBRATIONS[gesture] || null
}

/**
 * Get all available gesture calibrations
 */
export function getAllCalibrations(): Record<string, GestureCalibration> {
  return { ...GESTURE_CALIBRATIONS }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compare two gestures and return the one with higher normalized confidence.
 *
 * Useful when multiple gestures are detected and you need to pick the best one.
 */
export function compareGestureConfidence(
  gesture1: string,
  confidence1: number,
  gesture2: string,
  confidence2: number,
): { gesture: string; confidence: number; normalized: number } {
  const norm1 = normalizeGestureConfidence(gesture1, confidence1)
  const norm2 = normalizeGestureConfidence(gesture2, confidence2)

  if (norm1.normalized > norm2.normalized) {
    return {
      gesture: gesture1,
      confidence: confidence1,
      normalized: norm1.normalized,
    }
  }

  return {
    gesture: gesture2,
    confidence: confidence2,
    normalized: norm2.normalized,
  }
}

/**
 * Filter gestures by quality level.
 *
 * @example
 * const gestures = [
 *   { gesture: 'Victory', confidence: 0.85 },
 *   { gesture: 'Open_Palm', confidence: 0.62 },
 * ]
 *
 * const highQuality = filterByQuality(gestures, 'high')
 * // Returns Victory (0.85 is high quality for Victory)
 * // Filters out Open_Palm (0.62 is only medium for Open_Palm)
 */
export function filterByQuality(
  gestures: Array<{ gesture: string; confidence: number }>,
  minQuality: 'low' | 'medium' | 'high' | 'excellent',
): Array<{
  gesture: string
  confidence: number
  normalized: NormalizedConfidence
}> {
  const qualityOrder = ['low', 'medium', 'high', 'excellent']
  const minQualityIndex = qualityOrder.indexOf(minQuality)

  return gestures
    .map((g) => ({
      ...g,
      normalized: normalizeGestureConfidence(g.gesture, g.confidence),
    }))
    .filter(
      (g) => qualityOrder.indexOf(g.normalized.quality) >= minQualityIndex,
    )
}

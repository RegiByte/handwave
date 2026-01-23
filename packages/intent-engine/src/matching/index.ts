/**
 * Matching Module
 *
 * Pure functions for pattern matching:
 * - Contact detection (pinch gestures)
 * - Gesture matching
 * - Spatial matching (grid cells, regions)
 * - Calibration data (gesture and pinch thresholds)
 */

// Contact detection
export * from './contactDetector'

// Gesture matching
export * from './gestureMatcher'

// Spatial matching
export * from './spatialMatcher'

// Calibration data
export * from './gestureCalibration'
export * from './pinchCalibration'

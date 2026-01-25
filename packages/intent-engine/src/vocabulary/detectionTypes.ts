/**
 * Detection Types
 *
 * TypeScript type exports for the canonical detection system.
 * All types are inferred from Zod schemas for single source of truth.
 *
 * Usage:
 * ```typescript
 * import type { EnrichedDetectionFrame, RawHandDetection } from '@handwave/intent-engine'
 * ```
 */

// ============================================================================
// Re-export types from keywords
// ============================================================================

export type {
  DetectorType,
  Handedness,
  DetectionGestureName,
  HandLandmarkIndex,
  FaceBlendshapeName,
} from './detectionKeywords'

export type {
  // Primitives
  Landmark,
  Category,
  TransformationMatrix,
  // Raw types (adapter output)
  RawHandDetection,
  RawFaceDetection,
  RawDetectionFrame,
  // Enriched types (public API)
  EnrichedHandDetection,
  EnrichedFaceDetection,
  EnrichedDetectionFrame,
  // Detector-specific results
  HandDetectorResult,
  FaceDetectorResult,
  // Legacy compatibility
  LegacyGestureResult,
} from './detectionSchemas'

export {
  // Primitive schemas
  landmarkSchema,
  categorySchema,
  transformationMatrixSchema,
  // Raw schemas
  rawHandDetectionSchema,
  rawFaceDetectionSchema,
  rawDetectionFrameSchema,
  // Enriched schemas
  enrichedHandDetectionSchema,
  enrichedFaceDetectionSchema,
  enrichedDetectionFrameSchema,
  // Detector-specific schemas
  handDetectorResultSchema,
  faceDetectorResultSchema,
  // Legacy schemas
  legacyGestureResultSchema,
  // Validation functions
  validateRawDetectionFrame,
  validateEnrichedDetectionFrame,
  validateHandDetectorResult,
  validateFaceDetectorResult,
  // Enrichment utilities
  enrichDetectionFrame,
  toLegacyGestureResult,
} from './detectionSchemas'

export { detectionKeywords } from './detectionKeywords'

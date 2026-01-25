/**
 * Detection Schemas
 *
 * Canonical detection data structures for the HandWave system.
 * All detection adapters (MediaPipe, TensorFlow, custom) must transform
 * their native types to these canonical schemas.
 *
 * Philosophy:
 * - Two-tier system: Raw (adapter output) + Enriched (public API)
 * - Pluggable detectors: hand, face, body, eye, etc.
 * - Validation-ready: Zod schemas for import/export
 * - Framework-agnostic: No dependencies on detection libraries
 *
 * Architecture:
 * 1. Raw Detection Types - What adapters must produce (minimal, stable)
 * 2. Enriched Detection Types - What consumers receive (convenient, metadata)
 * 3. Detector-Specific Types - Per-detector result structures
 */

import { z } from 'zod'
import { detectionKeywords } from './detectionKeywords'

/**
 * 3D landmark with optional visibility
 * Used by all detectors (hand, face, body)
 *
 * Coordinates are normalized (0-1) relative to image dimensions
 * Z-depth is also normalized (negative = closer to camera)
 */
export const landmarkSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  visibility: z.number().optional(),
})

export type Landmark = z.infer<typeof landmarkSchema>

/**
 * Category with score (used for classifications)
 * Generic structure for any classification result
 */
export const categorySchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(1),
  index: z.number().int().optional(),
})

export type Category = z.infer<typeof categorySchema>

/**
 * 4x4 transformation matrix
 * Used for face pose estimation and 3D transforms
 */
export const transformationMatrixSchema = z.object({
  rows: z.literal(4),
  columns: z.literal(4),
  data: z.array(z.number()).length(16),
})

export type TransformationMatrix = z.infer<typeof transformationMatrixSchema>

/**
 * Raw hand detection (minimal structure from adapter)
 *
 * This is what hand detection adapters must produce.
 * Handedness is normalized to lowercase for consistency.
 */
export const rawHandDetectionSchema = z.object({
  handedness: z.enum([
    detectionKeywords.handedness.left,
    detectionKeywords.handedness.right,
    detectionKeywords.handedness.unknown,
  ]),
  handednessScore: z.number().min(0).max(1),
  gesture: z.string(), // Gesture name (e.g., 'Closed_Fist', 'Open_Palm')
  gestureScore: z.number().min(0).max(1),
  landmarks: z.array(landmarkSchema).length(21), // MediaPipe 21-point hand model
  worldLandmarks: z.array(landmarkSchema).length(21), // 3D world coordinates
})

export type RawHandDetection = z.infer<typeof rawHandDetectionSchema>

/**
 * Raw face detection (minimal structure from adapter)
 *
 * This is what face detection adapters must produce.
 * Landmarks count depends on the model (MediaPipe uses 478 points).
 */
export const rawFaceDetectionSchema = z.object({
  landmarks: z.array(landmarkSchema), // Face mesh landmarks (count varies by model)
  blendshapes: z.array(categorySchema).optional(), // Facial expression coefficients
  transformationMatrix: transformationMatrixSchema.optional(), // Face pose matrix
})

export type RawFaceDetection = z.infer<typeof rawFaceDetectionSchema>

/**
 * Raw detection frame (what adapters must produce)
 *
 * This is the canonical output format for all detection adapters.
 * Detectors are optional - enable only what you need.
 */
export const rawDetectionFrameSchema = z.object({
  timestamp: z.number(),
  detectors: z.object({
    hand: z.array(rawHandDetectionSchema).optional(),
    face: z.array(rawFaceDetectionSchema).optional(),
    // Future detectors:
    // body: z.array(rawBodyDetectionSchema).optional(),
    // eye: z.array(rawEyeDetectionSchema).optional(),
  }),
})

export type RawDetectionFrame = z.infer<typeof rawDetectionFrameSchema>

// ============================================================================
// Enriched Detection Types (Public API)
// ============================================================================

/**
 * Enriched hand detection (with metadata)
 *
 * This is what public APIs expose to consumers.
 * Adds handIndex and headIndex for multi-hand/multi-person tracking.
 */
export const enrichedHandDetectionSchema = rawHandDetectionSchema.extend({
  handIndex: z.number().int().min(0).max(3), // Which hand instance (0-3 for up to 4 hands)
  headIndex: z.number().int().min(0).max(1).default(0), // Which person (0-1 for multi-person)
})

export type EnrichedHandDetection = z.infer<typeof enrichedHandDetectionSchema>

/**
 * Enriched face detection (with metadata)
 *
 * This is what public APIs expose to consumers.
 * Adds faceIndex and headIndex for multi-face/multi-person tracking.
 */
export const enrichedFaceDetectionSchema = rawFaceDetectionSchema.extend({
  faceIndex: z.number().int().min(0).max(1), // Which face instance (0-1 for up to 2 faces)
  headIndex: z.number().int().min(0).max(1).default(0), // Which person (0-1 for multi-person)
})

export type EnrichedFaceDetection = z.infer<typeof enrichedFaceDetectionSchema>

/**
 * Enriched detection frame (public API)
 *
 * This is what consumers receive from the frame history and intent engine.
 * Includes metadata for tracking and identification.
 */
export const enrichedDetectionFrameSchema = z.object({
  timestamp: z.number(),
  detectors: z.object({
    hand: z.array(enrichedHandDetectionSchema).optional(),
    face: z.array(enrichedFaceDetectionSchema).optional(),
    // Future detectors:
    // body: z.array(enrichedBodyDetectionSchema).optional(),
    // eye: z.array(enrichedEyeDetectionSchema).optional(),
  }),
})

export type EnrichedDetectionFrame = z.infer<
  typeof enrichedDetectionFrameSchema
>

// ============================================================================
// Detector-Specific Result Types (for adapters)
// ============================================================================

/**
 * Hand detector result (what hand detector adapter produces)
 *
 * Adapters transform their native types to this structure.
 * Example: MediaPipe GestureRecognizerResult → HandDetectorResult
 */
export const handDetectorResultSchema = z.object({
  hands: z.array(rawHandDetectionSchema),
})

export type HandDetectorResult = z.infer<typeof handDetectorResultSchema>

/**
 * Face detector result (what face detector adapter produces)
 *
 * Adapters transform their native types to this structure.
 * Example: MediaPipe FaceLandmarkerResult → FaceDetectorResult
 */
export const faceDetectorResultSchema = z.object({
  faces: z.array(rawFaceDetectionSchema),
})

export type FaceDetectorResult = z.infer<typeof faceDetectorResultSchema>

// ============================================================================
// Legacy Compatibility Types (for gradual migration)
// ============================================================================

/**
 * Legacy gesture result format (for backward compatibility)
 *
 * This matches the old enriched format used in frameHistoryResource.
 * Will be deprecated once migration is complete.
 *
 * @deprecated Use EnrichedDetectionFrame instead
 */
export const legacyGestureResultSchema = z.object({
  hands: z.array(
    z.object({
      handedness: z.string(),
      handIndex: z.number(),
      headIndex: z.number(),
      gesture: z.string(),
      gestureScore: z.number(),
      landmarks: z.array(
        z.object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
          visibility: z.number().optional(),
        }),
      ),
      worldLandmarks: z
        .array(
          z.object({
            x: z.number(),
            y: z.number(),
            z: z.number(),
          }),
        )
        .optional(),
    }),
  ),
})

export type LegacyGestureResult = z.infer<typeof legacyGestureResultSchema>

/**
 * Validate a raw detection frame
 */
export function validateRawDetectionFrame(frame: unknown) {
  return rawDetectionFrameSchema.safeParse(frame)
}

/**
 * Validate an enriched detection frame
 */
export function validateEnrichedDetectionFrame(frame: unknown) {
  return enrichedDetectionFrameSchema.safeParse(frame)
}

/**
 * Validate a hand detector result
 */
export function validateHandDetectorResult(result: unknown) {
  return handDetectorResultSchema.safeParse(result)
}

/**
 * Validate a face detector result
 */
export function validateFaceDetectorResult(result: unknown) {
  return faceDetectorResultSchema.safeParse(result)
}

/**
 * Enrich raw detection frame with metadata
 *
 * Transforms Raw → Enriched by adding handIndex, faceIndex, headIndex.
 * This is the bridge between adapter output and public API.
 */
export function enrichDetectionFrame(
  raw: RawDetectionFrame,
): EnrichedDetectionFrame {
  return {
    timestamp: raw.timestamp,
    detectors: {
      hand: raw.detectors.hand?.map((hand, index) => ({
        ...hand,
        handIndex: index,
        headIndex: 0, // TODO: Multi-person tracking
      })),
      face: raw.detectors.face?.map((face, index) => ({
        ...face,
        faceIndex: index,
        headIndex: 0, // TODO: Multi-person tracking
      })),
    },
  }
}

/**
 * Convert enriched detection frame to legacy format
 *
 * For backward compatibility during migration.
 * Maps EnrichedDetectionFrame → LegacyGestureResult
 *
 * @deprecated Remove once migration is complete
 */
export function toLegacyGestureResult(
  frame: EnrichedDetectionFrame,
): LegacyGestureResult | null {
  if (!frame.detectors.hand) return null

  return {
    hands: frame.detectors.hand.map((hand) => ({
      handedness: hand.handedness,
      handIndex: hand.handIndex,
      headIndex: hand.headIndex,
      gesture: hand.gesture,
      gestureScore: hand.gestureScore,
      landmarks: hand.landmarks.map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility,
      })),
      worldLandmarks: hand.worldLandmarks.map((wlm) => ({
        x: wlm.x,
        y: wlm.y,
        z: wlm.z,
      })),
    })),
  }
}

/**
 * Detection Worker Schemas
 *
 * MediaPipe-specific schemas for worker communication and configuration.
 * Detection data types are imported from @handwave/intent-engine.
 */

import { deadZonesSchema } from '@handwave/intent-engine'
import type { Landmark, Category } from '@handwave/intent-engine'
import { z } from 'zod'

// Re-export canonical types for convenience
export type { Landmark, Category }

// ============================================================================
// Configuration Schemas
// ============================================================================

/**
 * Face landmarker configuration
 */
export const faceLandmarkerConfigSchema = z.object({
  numFaces: z.number().optional(),
  minFaceDetectionConfidence: z.number().optional(),
  minFacePresenceConfidence: z.number().optional(),
  minTrackingConfidence: z.number().optional(),
  outputFaceBlendshapes: z.boolean().optional(),
  outputFacialTransformationMatrixes: z.boolean().optional(),
})

export type FaceLandmarkerConfig = z.infer<typeof faceLandmarkerConfigSchema>

/**
 * Gesture recognizer configuration
 */
export const gestureRecognizerConfigSchema = z.object({
  numHands: z.number().optional(),
  minHandDetectionConfidence: z.number().optional(),
  minHandPresenceConfidence: z.number().optional(),
  minTrackingConfidence: z.number().optional(),
})

export type GestureRecognizerConfig = z.infer<
  typeof gestureRecognizerConfigSchema
>

/**
 * Model paths for initialization
 */
export const modelPathsSchema = z.object({
  faceLandmarker: z.string(),
  gestureRecognizer: z.string(),
  visionWasmPath: z.string(),
})

export type ModelPaths = z.infer<typeof modelPathsSchema>

// ============================================================================
// Spatial Schemas
// ============================================================================

/**
 * Cell coordinates for grid-based spatial tracking
 */
export const cellSchema = z.object({
  col: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
})

export type Cell = z.infer<typeof cellSchema>

/**
 * Hand spatial information for a single hand
 * Contains minimal data - main thread reads full data from SharedArrayBuffer
 */
export const handSpatialInfoSchema = z.object({
  handIndex: z.number().int().min(0).max(3), // Index in SharedArrayBuffer (0-3)
  landmarkIndex: z.number().int().min(0).max(20), // Which landmark we're tracking (8 = index finger tip)
  cells: z.object({
    coarse: cellSchema,
    medium: cellSchema,
    fine: cellSchema,
  }),
})

export type HandSpatialInfo = z.infer<typeof handSpatialInfoSchema>

/**
 * Spatial update message from worker
 * Sent every frame with hand spatial positions
 */
export const spatialUpdateMessageSchema = z.object({
  type: z.literal('spatialUpdate'),
  timestamp: z.number(),
  hands: z.array(handSpatialInfoSchema),
})

export type SpatialUpdateMessage = z.infer<typeof spatialUpdateMessageSchema>

// ============================================================================
// Display Context Schemas
// ============================================================================


/**
 * Display context for worker
 * Contains display-related state needed for correct spatial calculations
 */
export const displayContextSchema = z.object({
  deadZones: deadZonesSchema,
  mirrored: z.boolean(),
})

export type DisplayContext = z.infer<typeof displayContextSchema>

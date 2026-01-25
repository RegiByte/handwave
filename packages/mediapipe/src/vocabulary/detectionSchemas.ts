/**
 * Detection Worker Schemas
 *
 * Zod schemas for detection worker task inputs and outputs.
 * These schemas define the shape of data passed between main thread and worker.
 */

import { deadZonesSchema } from '@handwave/intent-engine'
import { z } from 'zod'

// ============================================================================
// Shared Schemas (MediaPipe Result Types)
// ============================================================================

/**
 * 3D landmark with optional visibility
 */
export const landmarkSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  visibility: z.number().optional(),
})

export type Landmark = z.infer<typeof landmarkSchema>

/**
 * Category with score (used for blendshapes, gestures, etc.)
 */
export const categorySchema = z.object({
  categoryName: z.string(),
  score: z.number(),
  index: z.number().optional(),
  displayName: z.string().optional(),
})

export type Category = z.infer<typeof categorySchema>

// ============================================================================
// Face Detection Schemas
// ============================================================================

/**
 * Face detection result
 */
export const faceResultSchema = z.object({
  landmarks: z.array(landmarkSchema),
  blendshapes: z.array(categorySchema).optional(),
  facialTransformationMatrixes: z.array(z.number()).optional(),
})

export type FaceResult = z.infer<typeof faceResultSchema>

// ============================================================================
// Hand/Gesture Detection Schemas
// ============================================================================

/**
 * Single hand result
 */
export const handResultSchema = z.object({
  handedness: z.string(), // 'Left' or 'Right'
  landmarks: z.array(landmarkSchema),
  worldLandmarks: z.array(landmarkSchema).optional(),
})

export type HandResult = z.infer<typeof handResultSchema>

/**
 * Gesture recognition result
 */
export const gestureResultSchema = z.object({
  hands: z.array(handResultSchema),
  gestures: z.array(categorySchema),
})

export type GestureResult = z.infer<typeof gestureResultSchema>

// ============================================================================
// Combined Detection Result
// ============================================================================

/**
 * Combined detection result from worker
 */
export const detectionResultSchema = z.object({
  faceResult: faceResultSchema.nullable(),
  gestureResult: gestureResultSchema.nullable(),
  processingTimeMs: z.number(),
  timestamp: z.number(),
})

export type DetectionResult = z.infer<typeof detectionResultSchema>

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

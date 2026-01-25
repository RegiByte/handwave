/**
 * Recording System Schemas
 *
 * Zod schemas for recording detection frames into JSON snapshots.
 * These recordings become the foundation for test-driven development.
 */

import { z } from 'zod'
import {
  cellSchema,
  deadZonesSchema,
  gridConfigSchema,
  gridResolutionSchema,
  positionSchema,
  viewportSchema,
} from './schemas'
import { enrichedDetectionFrameSchema } from './detectionSchemas'

// ============================================================================
// Note: Recorded frames now use canonical EnrichedDetectionFrame
// No need for separate RecordedHand/RecordedLandmark schemas
// ============================================================================

// ============================================================================
// Spatial Context
// ============================================================================

/**
 * Hand cell information (which cell each hand is in)
 */
export const handCellInfoSchema = z.object({
  handIndex: z.number().int().min(0).max(3),
  cell: cellSchema,
  position: positionSchema, // normalized 0-1
  gridResolution: gridResolutionSchema,
})

export type HandCellInfo = z.infer<typeof handCellInfoSchema>

/**
 * Spatial context for a frame
 */
export const spatialContextSchema = z.object({
  grid: gridConfigSchema,
  deadZones: deadZonesSchema,
  mirrored: z.boolean(),
  viewport: viewportSchema,
  handCells: z.array(handCellInfoSchema),
})

export type SpatialContext = z.infer<typeof spatialContextSchema>

// ============================================================================
// Performance Metrics
// ============================================================================

/**
 * Performance metrics for a frame
 */
export const performanceMetricsSchema = z.object({
  workerFPS: z.number(),
  mainFPS: z.number(),
})

export type PerformanceMetrics = z.infer<typeof performanceMetricsSchema>

// ============================================================================
// Recorded Frame
// ============================================================================

/**
 * Single recorded frame (complete snapshot of detection state)
 * 
 * Uses canonical EnrichedDetectionFrame for detection data.
 * This is the single source of truth for recorded detection data.
 */
export const recordedFrameSchema = z.object({
  timestamp: z.number(),
  frameIndex: z.number().int().nonnegative(),
  detectionFrame: enrichedDetectionFrameSchema.nullable(), // Canonical detection data
  spatial: spatialContextSchema,
  performance: performanceMetricsSchema,
})

export type RecordedFrame = z.infer<typeof recordedFrameSchema>

// ============================================================================
// Recording Session
// ============================================================================

/**
 * Complete recording session
 */
export const recordingSessionSchema = z.object({
  sessionId: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  frameCount: z.number().int().nonnegative(),
  frames: z.array(recordedFrameSchema),
  metadata: z.object({
    gridResolutions: z.array(gridResolutionSchema),
    description: z.string().optional(),
  }),
})

export type RecordingSession = z.infer<typeof recordingSessionSchema>

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a recorded frame
 */
export function validateRecordedFrame(frame: unknown) {
  return recordedFrameSchema.safeParse(frame)
}

/**
 * Validate a recording session
 */
export function validateRecordingSession(session: unknown) {
  return recordingSessionSchema.safeParse(session)
}

/**
 * Intent Engine Schemas
 *
 * Zod schemas for runtime validation and type inference.
 * All type strings reference the keywords module to prevent drift.
 */

import { z } from 'zod'
import { intentKeywords } from './keywords'

// ============================================================================
// Spatial Types
// ============================================================================

/**
 * 3D vector (position, velocity, etc.)
 */
export const vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
})

export type Vector3 = z.infer<typeof vector3Schema>

/**
 * Position (alias for Vector3)
 */
export const positionSchema = vector3Schema

export type Position = z.infer<typeof positionSchema>

/**
 * Grid cell coordinates
 */
export const cellSchema = z.object({
  col: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
})

export type Cell = z.infer<typeof cellSchema>

/**
 * Grid configuration
 */
export const gridConfigSchema = z.object({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
})

export type GridConfig = z.infer<typeof gridConfigSchema>

/**
 * Hysteresis configuration
 */
export const hysteresisConfigSchema = z.object({
  threshold: z.number().min(0).max(1), // 0-1, percentage of cell size
})

export type HysteresisConfig = z.infer<typeof hysteresisConfigSchema>

/**
 * Viewport configuration
 */
export const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
})

export type Viewport = z.infer<typeof viewportSchema>

// ============================================================================
// Pattern Matching Types
// ============================================================================

/**
 * Gesture pattern (for intent matching)
 *
 * Discriminated by type: 'gesture'
 *
 * Note: handIndex is optional. If not specified, matches ANY hand of that handedness.
 * If specified (0-3), matches ONLY that specific hand instance.
 */
export const gesturePatternSchema = z.object({
  type: z.literal(intentKeywords.patternTypes.gesture),
  hand: z.enum([intentKeywords.hands.left, intentKeywords.hands.right]),
  handIndex: z.number().int().min(0).max(3).optional(), // 0-3 for up to 4 hands (MAX_HANDS)
  gesture: z.enum([
    intentKeywords.gestures.closedFist,
    intentKeywords.gestures.openPalm,
    intentKeywords.gestures.pointingUp,
    intentKeywords.gestures.thumbUp,
    intentKeywords.gestures.thumbDown,
    intentKeywords.gestures.victory,
    intentKeywords.gestures.iLoveYou,
    intentKeywords.gestures.none,
  ]),
  confidence: z.number().min(0).max(1).optional().default(0.7),
})

export type GesturePattern = z.infer<typeof gesturePatternSchema>

/**
 * Contact pattern (for pinch/touch detection)
 *
 * Discriminated by type: 'contact'
 *
 * Note: handIndex is optional. If not specified, matches ANY hand of that handedness.
 * If specified (0-3), matches ONLY that specific hand instance.
 */
export const contactPatternSchema = z.object({
  type: z.literal(intentKeywords.patternTypes.contact),
  hand: z.enum([intentKeywords.hands.left, intentKeywords.hands.right]),
  handIndex: z.number().int().min(0).max(3).optional(), // 0-3 for up to 4 hands (MAX_HANDS)
  contactType: z.enum([
    intentKeywords.contactTypes.pinch,
    intentKeywords.contactTypes.touch,
  ]),
  fingers: z.array(
    z.enum([
      intentKeywords.fingers.thumb,
      intentKeywords.fingers.index,
      intentKeywords.fingers.middle,
      intentKeywords.fingers.ring,
      intentKeywords.fingers.pinky,
    ]),
  ),
  threshold: z.number().positive().optional().default(0.05), // normalized distance
})

export type ContactPattern = z.infer<typeof contactPatternSchema>

/**
 * Pattern union (discriminated by 'type')
 *
 * This discriminated union allows easy pattern matching and extensibility.
 * New pattern types can be added by:
 * 1. Adding to intentKeywords.patternTypes
 * 2. Creating a new schema with type discriminator
 * 3. Adding to this discriminated union
 */
export const patternSchema = z.discriminatedUnion('type', [
  gesturePatternSchema,
  contactPatternSchema,
])

export type Pattern = z.infer<typeof patternSchema>

// ============================================================================
// Intent Configuration Types
// ============================================================================

/**
 * Spatial configuration for an intent
 */
export const spatialConfigSchema = z.object({
  grid: gridConfigSchema.optional(),
  hysteresis: hysteresisConfigSchema.optional(),
})

export type SpatialConfig = z.infer<typeof spatialConfigSchema>

/**
 * Temporal configuration for an intent
 */
export const temporalConfigSchema = z.object({
  minDuration: z.number().nonnegative().optional(), // ms, must hold for this long to start
  maxGap: z.number().nonnegative().optional(), // ms, if interrupted < this, resume
})

export type TemporalConfig = z.infer<typeof temporalConfigSchema>

// ============================================================================
// Action Types
// ============================================================================

/**
 * Action context (passed to intent lifecycle hooks)
 *
 * Note: handIndex is required in action context (not optional).
 * Once an action starts, we must track the specific hand instance.
 */
export const actionContextSchema = z.object({
  actionId: z.string(),
  intentId: z.string(),
  hand: z.enum([intentKeywords.hands.left, intentKeywords.hands.right]),
  handIndex: z.number().int().min(0).max(3), // Required: which hand instance (0-3)
  position: positionSchema,
  cell: cellSchema,
  velocity: vector3Schema,
  timestamp: z.number(),
  duration: z.number().nonnegative(),
})

export type ActionContext = z.infer<typeof actionContextSchema>

/**
 * Active action state
 */
export const activeActionSchema = z.object({
  id: z.string(),
  intentId: z.string(),
  state: z.enum([
    intentKeywords.actionStates.pending,
    intentKeywords.actionStates.active,
    intentKeywords.actionStates.ending,
  ]),
  startTime: z.number(),
  lastUpdateTime: z.number(),
  context: actionContextSchema,
})

export type ActiveAction = z.infer<typeof activeActionSchema>

// ============================================================================
// Event Types
// ============================================================================

/**
 * Base intent event
 */
export const intentEventSchema = z
  .object({
    type: z.string(), // e.g., 'draw:start', 'draw:update', 'draw:end'
    id: z.string(),
    timestamp: z.number(),
    // Allow additional properties
  })
  .loose()

export type IntentEvent = z.infer<typeof intentEventSchema>

/**
 * End reason enum
 */
export const endReasonSchema = z.enum([
  intentKeywords.endReasons.completed,
  intentKeywords.endReasons.cancelled,
  intentKeywords.endReasons.timeout,
])

export type EndReason = z.infer<typeof endReasonSchema>

// ============================================================================
// Frame History Types
// ============================================================================

/**
 * Frame snapshot (simplified - references MediaPipe types)
 */
export const frameSnapshotSchema = z.object({
  timestamp: z.number(),
  faceResult: z.any().nullable(), // Will reference MediaPipe types
  gestureResult: z.any().nullable(), // Will reference MediaPipe types
})

export type FrameSnapshot = z.infer<typeof frameSnapshotSchema>

// ============================================================================
// Intent Definition Types (for DSL)
// ============================================================================

/**
 * Intent definition (declarative)
 * Note: Lifecycle hooks (onStart, onUpdate, onEnd) are functions,
 * so we don't validate them with Zod - they're part of the TypeScript type only
 */
export const intentDefinitionSchema = z.object({
  id: z.string(),
  modifier: patternSchema.optional(),
  action: patternSchema,
  spatial: spatialConfigSchema.optional(),
  temporal: temporalConfigSchema.optional(),
  // onStart, onUpdate, onEnd are functions - not validated by Zod
})

export type IntentDefinition = z.infer<typeof intentDefinitionSchema>

// ============================================================================
// Engine Configuration Types
// ============================================================================

/**
 * Intent engine configuration
 */
export const intentEngineConfigSchema = z.object({
  // source: detectionWorker - not validated by Zod (resource reference)
  intents: z.array(intentDefinitionSchema),
  historySize: z.number().int().positive().optional().default(10),
  spatial: z
    .object({
      grid: gridConfigSchema,
      hysteresis: hysteresisConfigSchema.optional(),
    })
    .optional(),
  temporal: z
    .object({
      defaultMinDuration: z.number().nonnegative().optional(),
      defaultMaxGap: z.number().nonnegative().optional(),
    })
    .optional(),
})

export type IntentEngineConfig = z.infer<typeof intentEngineConfigSchema>

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate an intent definition
 */
export function validateIntent(intent: unknown) {
  return intentDefinitionSchema.safeParse(intent)
}

/**
 * Validate an engine configuration
 */
export function validateEngineConfig(config: unknown) {
  return intentEngineConfigSchema.safeParse(config)
}

/**
 * Validate an action context
 */
export function validateActionContext(context: unknown) {
  return actionContextSchema.safeParse(context)
}

/**
 * MediaPipe System Command and Event Schemas
 *
 * Zod schemas for runtime validation and type inference.
 * All type strings reference the keywords module to prevent drift.
 */

import { z } from 'zod'
import { mediapipeKeywords } from './keywords'

// ============================================================================
// Commands
// ============================================================================

// Lifecycle commands
const startCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.start),
})

const stopCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.stop),
})

// Playback control commands
const pauseCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.pause),
})

const resumeCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.resume),
})

const togglePauseCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.togglePause),
})

// Display control commands
const toggleMirrorCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.toggleMirror),
})

const setMirroredCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.setMirrored),
  mirrored: z.boolean(),
})

// Device management commands
const setVideoDeviceCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.setVideoDevice),
  deviceId: z.string(),
})

const setAudioDeviceCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.setAudioDevice),
  deviceId: z.string().nullable(),
  enableAudio: z.boolean(),
})

// Debug toggle commands
const toggleDebugModeCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.toggleDebugMode),
})

const toggleHandLandmarkLabelsCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.toggleHandLandmarkLabels),
})

const toggleFaceLandmarkLabelsCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.toggleFaceLandmarkLabels),
})

const toggleBlendshapesDisplayCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.toggleBlendshapesDisplay),
})

const toggleHandCoordinatesCommandSchema = z.object({
  type: z.literal(mediapipeKeywords.commands.toggleHandCoordinates),
})

// Union of all commands
export const mediaPipeCommandSchema = z.discriminatedUnion('type', [
  startCommandSchema,
  stopCommandSchema,
  pauseCommandSchema,
  resumeCommandSchema,
  togglePauseCommandSchema,
  toggleMirrorCommandSchema,
  setMirroredCommandSchema,
  setVideoDeviceCommandSchema,
  setAudioDeviceCommandSchema,
  toggleDebugModeCommandSchema,
  toggleHandLandmarkLabelsCommandSchema,
  toggleFaceLandmarkLabelsCommandSchema,
  toggleBlendshapesDisplayCommandSchema,
  toggleHandCoordinatesCommandSchema,
])

export type MediaPipeCommand = z.infer<typeof mediaPipeCommandSchema>

// ============================================================================
// Events
// ============================================================================

// Lifecycle events
const initializedEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.initialized),
})

const startedEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.started),
})

const stoppedEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.stopped),
})

// State change events
const pausedEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.paused),
})

const resumedEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.resumed),
})

const mirrorToggledEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.mirrorToggled),
  mirrored: z.boolean(),
})

// Device change events
const videoDeviceChangedEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.videoDeviceChanged),
  deviceId: z.string(),
})

const audioDeviceChangedEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.audioDeviceChanged),
  deviceId: z.string().nullable(),
})

// MediaDeviceInfo schema (browser API type)
const mediaDeviceInfoSchema = z.object({
  deviceId: z.string(),
  groupId: z.string(),
  kind: z.enum(['audioinput', 'audiooutput', 'videoinput']),
  label: z.string(),
  toJSON: z.function().optional(),
})

const devicesEnumeratedEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.devicesEnumerated),
  videoDevices: z.array(mediaDeviceInfoSchema),
  audioDevices: z.array(mediaDeviceInfoSchema),
})

// Debug state change events
const debugModeToggledEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.debugModeToggled),
  enabled: z.boolean(),
})

// Error events
const errorEventSchema = z.object({
  type: z.literal(mediapipeKeywords.events.error),
  error: z.string(),
  meta: z.unknown().optional(),
})

// Union of all events
export const mediaPipeEventSchema = z.discriminatedUnion('type', [
  initializedEventSchema,
  startedEventSchema,
  stoppedEventSchema,
  pausedEventSchema,
  resumedEventSchema,
  mirrorToggledEventSchema,
  videoDeviceChangedEventSchema,
  audioDeviceChangedEventSchema,
  devicesEnumeratedEventSchema,
  debugModeToggledEventSchema,
  errorEventSchema,
])

export type MediaPipeEvent = z.infer<typeof mediaPipeEventSchema>

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse and validate a command
 */
export function parseCommand(data: unknown): MediaPipeCommand {
  return mediaPipeCommandSchema.parse(data)
}

/**
 * Parse and validate an event
 */
export function parseEvent(data: unknown): MediaPipeEvent {
  return mediaPipeEventSchema.parse(data)
}

/**
 * Safe parse a command (returns success/error result)
 */
export function safeParseCommand(data: unknown) {
  return mediaPipeCommandSchema.safeParse(data)
}

/**
 * Safe parse an event (returns success/error result)
 */
export function safeParseEvent(data: unknown) {
  return mediaPipeEventSchema.safeParse(data)
}

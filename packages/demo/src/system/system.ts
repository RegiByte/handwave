/**
 * MediaPipe System Configuration (Demo)
 *
 * This file extends the base MediaPipe system with demo-specific resources.
 * Resources are started in dependency order and halted in reverse order.
 *
 * Dependency Graph:
 *
 *   camera (no deps) ← from @handwave/mediapipe
 *       ↓
 *   detectionWorker (no deps) ← from @handwave/mediapipe
 *       ↓
 *   canvas (no deps) ← from @handwave/mediapipe
 *       ↓
 *   frameRater (no deps) ← from @handwave/mediapipe
 *       ↓
 *   loop ← camera, detectionWorker, canvas, frameRater ← from @handwave/mediapipe
 *       ↓
 *   runtime ← camera, loop, detectionWorker (demo-specific)
 *       ↓
 *   shortcuts ← runtime (demo-specific)
 *       ↓
 *   recording, frameHistory, intentEngine (demo-specific)
 *
 * Note: Detection runs in Web Worker to free up the main thread for rendering.
 * The worker loads MediaPipe models independently and processes frames off the main thread.
 */

import type { StartedSystem } from 'braided'
import { createSystemHooks, createSystemManager } from 'braided-react'
import {
  cameraResource,
  canvasResource,
  detectionWorkerResource,
  frameRater,
  loopResource,
} from '@handwave/mediapipe'
import { runtimeResource } from './resources/runtime'
import { shortcutsResource } from './resources/shortcuts'
import { recordingResource } from './resources/recordingResource'
import { frameHistoryResource } from './resources/frameHistoryResource'
import { intentEngineResource } from './resources/intentEngineResource'

// System configuration - extends base MediaPipe with demo-specific resources
export const mediapipeSystemConfig = {
  camera: cameraResource,
  detectionWorker: detectionWorkerResource,
  canvas: canvasResource,
  frameRater: frameRater,
  loop: loopResource,
  runtime: runtimeResource,
  shortcuts: shortcutsResource,
  recording: recordingResource,
  frameHistory: frameHistoryResource,
  intentEngine: intentEngineResource,
}

// Create the system manager (singleton)
export const mediapipeManager = createSystemManager(mediapipeSystemConfig)

// Create typed hooks for React integration
export const {
  useSystem: useMediapipeSystem,
  useResource: useMediapipeResource,
  useSystemStatus: useMediapipeStatus,
  SystemProvider: MediapipeSystemProvider,
} = createSystemHooks(mediapipeManager)

// Re-export types for convenience
export type MediapipeSystem = StartedSystem<typeof mediapipeSystemConfig>

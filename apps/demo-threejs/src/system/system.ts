/**
 * MediaPipe System Configuration (Three.js Demo)
 *
 * Simplified system for 3D demo - extends base MediaPipe with minimal resources.
 *
 * Dependency Graph:
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
 *   frameHistory ← loop (demo-specific)
 *       ↓
 *   intentEngine ← frameHistory (demo-specific)
 *       ↓
 *   world ← intentEngine, frameHistory (demo-specific)
 *       ↓
 *   runtime ← camera, loop, detectionWorker, frameHistory, intentEngine (demo-specific)
 *       ↓
 *   shortcuts ← runtime (demo-specific)
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
import { frameHistoryResource } from './resources/frameHistoryResource'
import { intentEngineResource } from './resources/intentEngineResource'
import { worldResource } from './resources/worldResource'
import { shortcutsResource } from './resources/shortcuts'

// System configuration - extends base MediaPipe with demo-specific resources
export const mediapipeSystemConfig = {
  camera: cameraResource,
  detectionWorker: detectionWorkerResource,
  canvas: canvasResource,
  frameRater: frameRater,
  loop: loopResource,
  frameHistory: frameHistoryResource,
  intentEngine: intentEngineResource,
  world: worldResource,
  runtime: runtimeResource,
  shortcuts: shortcutsResource,
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

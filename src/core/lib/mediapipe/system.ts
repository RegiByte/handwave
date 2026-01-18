/**
 * MediaPipe System Configuration
 *
 * This file defines the complete system graph for MediaPipe face/hand tracking.
 * Resources are started in dependency order and halted in reverse order.
 *
 * Dependency Graph:
 *
 *   camera (no deps)
 *       ↓
 *   detectionWorker (no deps) - Web Worker for MediaPipe detection
 *       ↓
 *   canvas (no deps)
 *       ↓
 *   loop ← camera, detectionWorker, canvas
 *       ↓
 *   runtime ← camera, loop
 *       ↓
 *   shortcuts ← runtime
 *
 * Note: Detection now runs in Web Worker for 60 FPS rendering!
 * The worker loads MediaPipe models independently and processes frames off the main thread.
 */

import type { StartedSystem } from 'braided'
import { createSystemHooks, createSystemManager } from 'braided-react'
import { cameraResource } from './resources/camera'
import { canvasResource } from './resources/canvas'
import { detectionWorkerResource } from './resources/detectionWorker'
import { frameRater } from './resources/frameRater'
import { loopResource } from './resources/loop'
import { runtimeResource } from './resources/runtime'
import { shortcutsResource } from './resources/shortcuts'

// System configuration - defines the resource graph
export const mediapipeSystemConfig = {
  camera: cameraResource,
  detectionWorker: detectionWorkerResource,
  canvas: canvasResource,
  frameRater: frameRater,
  loop: loopResource,
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

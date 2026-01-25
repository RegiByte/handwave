/**
 * MediaPipe System Configuration
 *
 * Core MediaPipe detection system without application-specific resources.
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
 *   frameRater (no deps)
 *       ↓
 *   loop ← camera, detectionWorker, canvas, frameRater
 *
 * Note: Detection runs in Web Worker for 60 FPS rendering!
 * The worker loads MediaPipe models independently and processes frames off the main thread.
 * 
 * Application-specific resources (runtime, shortcuts, tasks) should be added
 * by the consuming application.
 */

import type { StartedSystem } from 'braided'
import { createSystemHooks, createSystemManager } from 'braided-react'
import { cameraResource } from './detection/camera'
import { canvasResource } from './detection/canvas'
import { detectionWorkerResource } from './detection/detectionWorker'
import { frameRater } from './detection/frameRater'
import { loopResource } from './detection/loop'

// System configuration - defines the resource graph
export const mediapipeSystemConfig = {
  camera: cameraResource,
  detectionWorker: detectionWorkerResource,
  canvas: canvasResource,
  frameRater: frameRater,
  loop: loopResource,
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

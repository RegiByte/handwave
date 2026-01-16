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
 *   vision (no deps)
 *       ↓
 *   faceLandmarker ← vision
 *   gestureRecognizer ← vision
 *       ↓
 *   canvas (no deps)
 *       ↓
 *   loop ← camera, faceLandmarker, gestureRecognizer, canvas
 *       ↓
 *   runtime ← camera, loop
 *       ↓
 *   shortcuts ← runtime
 */

import type { StartedSystem } from 'braided'
import { createSystemHooks, createSystemManager } from 'braided-react'
import { cameraResource } from './resources/camera'
import { canvasResource } from './resources/canvas'
import { faceLandmarkerResource } from './resources/face-landmarker'
import { frameRater } from './resources/frameRater'
import { gestureRecognizerResource } from './resources/gesture-recognizer'
import { loopResource } from './resources/loop'
import { runtimeResource } from './resources/runtime'
import { shortcutsResource } from './resources/shortcuts'
import { visionResource } from './resources/vision'

// System configuration - defines the resource graph
export const mediapipeSystemConfig = {
  camera: cameraResource,
  vision: visionResource,
  faceLandmarker: faceLandmarkerResource,
  gestureRecognizer: gestureRecognizerResource,
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

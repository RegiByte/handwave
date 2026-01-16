/**
 * Worker System Tasks
 *
 * Task definitions for the braided worker system.
 * These tasks interact with the worker's internal braided system
 * rather than managing state directly.
 *
 * Philosophy: Tasks are the public API. System is the implementation.
 * Main thread sends commands, worker system handles them.
 */

import { haltSystem, startSystem } from 'braided'
import { z } from 'zod'
import type { WorkerSystem } from '@/lib/mediapipe/resources/worker/workerSystem'
import { createWorkerSystemConfig } from '@/lib/mediapipe/resources/worker/workerSystem'
import { detectionKeywords } from '@/lib/mediapipe/vocabulary/detectionKeywords'
import {
  detectionResultSchema,
  faceLandmarkerConfigSchema,
  gestureRecognizerConfigSchema,
  modelPathsSchema,
} from '@/lib/mediapipe/vocabulary/detectionSchemas'
import { defineTask } from '@/lib/workerTasks/core'

// ============================================================================
// Worker-Local State
// ============================================================================

let workerSystem: WorkerSystem | null = null
let systemConfig: ReturnType<typeof createWorkerSystemConfig> | null = null

// ============================================================================
// Command/Event Schemas
// ============================================================================

const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(detectionKeywords.commands.start) }),
  z.object({ type: z.literal(detectionKeywords.commands.stop) }),
  z.object({ type: z.literal(detectionKeywords.commands.pause) }),
  z.object({ type: z.literal(detectionKeywords.commands.resume) }),
  z.object({
    type: z.literal(detectionKeywords.commands.setTargetFPS),
    fps: z.number(),
  }),
  z.object({
    type: z.literal(detectionKeywords.commands.setDetectionSettings),
    detectFace: z.boolean().optional(),
    detectHands: z.boolean().optional(),
  }),
])

export type DetectionCommand = z.infer<typeof commandSchema>

const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(detectionKeywords.events.initialized) }),
  z.object({ type: z.literal(detectionKeywords.events.started) }),
  z.object({ type: z.literal(detectionKeywords.events.stopped) }),
  z.object({ type: z.literal(detectionKeywords.events.paused) }),
  z.object({ type: z.literal(detectionKeywords.events.resumed) }),
  z.object({
    type: z.literal(detectionKeywords.events.frame),
    result: detectionResultSchema,
  }),
  z.object({
    type: z.literal(detectionKeywords.events.error),
    error: z.string(),
  }),
])

export type DetectionEvent = z.infer<typeof eventSchema>

// ============================================================================
// Task Definitions
// ============================================================================

/**
 * Initialize the worker braided system
 * Creates and starts the full resource graph
 */
export const initializeWorkerTask = defineTask({
  input: z.object({
    modelPaths: modelPathsSchema.optional(),
    faceLandmarkerConfig: faceLandmarkerConfigSchema.optional(),
    gestureRecognizerConfig: gestureRecognizerConfigSchema.optional(),
    targetFPS: z.number().optional(),
  }),
  output: z.object({
    success: z.boolean(),
    message: z.string(),
    modelsLoaded: z.array(z.string()).optional(),
    initTimeMs: z.number().optional(),
  }),
  parseIO: false,
  execute: async (input) => {
    console.log('[SystemTasks] Initializing worker system...')

    // Halt existing system if any
    if (workerSystem && systemConfig) {
      console.log('[SystemTasks] Halting existing system...')
      await haltSystem(systemConfig, workerSystem)
      workerSystem = null
      systemConfig = null
    }

    // Create system config with initial state
    systemConfig = createWorkerSystemConfig({
      config: {
        modelPaths: input.modelPaths || {
          faceLandmarker:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          gestureRecognizer:
            'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          visionWasmPath:
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
        },
        faceLandmarker: input.faceLandmarkerConfig || {},
        gestureRecognizer: input.gestureRecognizerConfig || {},
      },
      detection: {
        detectFace: true,
        detectHands: true,
        targetFPS: input.targetFPS || 30,
      },
    })

    // Start the system
    const result = await startSystem(systemConfig)

    if (result.errors.size > 0) {
      console.error('[SystemTasks] System started with errors:', result.errors)
      return {
        success: false,
        message: `System start failed: ${Array.from(result.errors.entries())
          .map(([k, v]) => `${k}: ${v.message}`)
          .join(', ')}`,
      }
    }

    workerSystem = result.system
    console.log('[SystemTasks] ✅ Worker system started')

    return {
      success: true,
      message: 'Worker system initialized',
      modelsLoaded: workerSystem.workerVision.modelsLoaded,
      initTimeMs: workerSystem.workerVision.initTimeMs,
    }
  },
})

/**
 * Start the detection loop
 * Worker will run detection independently at target FPS
 */
export const startDetectionTask = defineTask({
  input: z.object({}),
  output: z.object({
    running: z.boolean(),
  }),
  progress: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('detection'),
      event: eventSchema,
    }),
  ]),
  execute: async (_input, { reportProgress }) => {
    if (!workerSystem) {
      throw new Error('System not initialized - call initializeWorker first')
    }

    const loop = workerSystem.workerUpdateLoop

    // Subscribe to loop events and forward as progress
    loop.onEvent((event) => {
      switch (event.type) {
        case 'started':
          reportProgress({
            type: 'detection',
            event: { type: detectionKeywords.events.started },
          })
          break
        case 'stopped':
          reportProgress({
            type: 'detection',
            event: { type: detectionKeywords.events.stopped },
          })
          break
        case 'paused':
          reportProgress({
            type: 'detection',
            event: { type: detectionKeywords.events.paused },
          })
          break
        case 'resumed':
          reportProgress({
            type: 'detection',
            event: { type: detectionKeywords.events.resumed },
          })
          break
        case 'frame':
          reportProgress({
            type: 'detection',
            event: {
              type: detectionKeywords.events.frame,
              result: event.result,
            },
          })
          break
        case 'error':
          reportProgress({
            type: 'detection',
            event: { type: detectionKeywords.events.error, error: event.error },
          })
          break
      }
    })

    // Start the loop
    loop.start()

    return Promise.resolve({ running: true })
  },
})

/**
 * Stop the detection loop
 */
export const stopDetectionTask = defineTask({
  input: z.object({}),
  output: z.object({
    stopped: z.boolean(),
  }),
  execute: async () => {
    if (!workerSystem) {
      throw new Error('System not initialized')
    }

    workerSystem.workerUpdateLoop.stop()
    return Promise.resolve({ stopped: true })
  },
})

/**
 * Halt the entire worker system
 */
export const haltWorkerTask = defineTask({
  input: z.object({}),
  output: z.object({
    halted: z.boolean(),
  }),
  execute: async () => {
    if (!workerSystem || !systemConfig) {
      return { halted: true } // Already halted
    }

    try {
      await haltSystem(systemConfig, workerSystem)
      workerSystem = null
      systemConfig = null
      console.log('[SystemTasks] Worker system halted')
      return { halted: true }
    } catch (error) {
      console.error('[SystemTasks] Error halting system:', error)
      return { halted: false }
    }
  },
})

/**
 * Push a video frame to the worker for detection
 * Main thread sends ImageBitmap, worker stores it for next detection tick
 */
export const pushFrameTask = defineTask({
  input: z.object({
    frame: z.instanceof(ImageBitmap),
    timestamp: z.number(),
  }),
  output: z.object({
    received: z.boolean(),
  }),
  parseIO: false, // ImageBitmap can't be parsed by Zod
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error('System not initialized - call initializeWorker first')
    }

    workerSystem.workerDetectors.pushFrame(input.frame, input.timestamp)

    return Promise.resolve({
      received: true,
    })
  },
})

/**
 * Send a command to the worker system
 */
export const commandTask = defineTask({
  input: z.object({
    command: commandSchema,
  }),
  output: z.object({
    dispatched: z.boolean(),
  }),
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error('System not initialized')
    }

    const { command } = input

    switch (command.type) {
      case detectionKeywords.commands.start:
        workerSystem.workerUpdateLoop.start()
        break
      case detectionKeywords.commands.stop:
        workerSystem.workerUpdateLoop.stop()
        break
      case detectionKeywords.commands.pause:
        workerSystem.workerUpdateLoop.pause()
        break
      case detectionKeywords.commands.resume:
        workerSystem.workerUpdateLoop.resume()
        break
      case detectionKeywords.commands.setTargetFPS:
        workerSystem.workerUpdateLoop.setTargetFPS(command.fps)
        break
      case detectionKeywords.commands.setDetectionSettings:
        workerSystem.workerStore.setDetectionSettings({
          detectFace: command.detectFace,
          detectHands: command.detectHands,
        })
        break
    }

    return Promise.resolve({ dispatched: true })
  },
})

// ============================================================================
// Task Registry
// ============================================================================

export const systemTasks = {
  [detectionKeywords.tasks.initializeWorker]: initializeWorkerTask,
  [detectionKeywords.tasks.startDetection]: startDetectionTask,
  [detectionKeywords.tasks.stopDetection]: stopDetectionTask,
  [detectionKeywords.tasks.haltWorker]: haltWorkerTask,
  [detectionKeywords.tasks.pushFrame]: pushFrameTask,
  [detectionKeywords.tasks.command]: commandTask,
} as const

export type SystemTasks = typeof systemTasks

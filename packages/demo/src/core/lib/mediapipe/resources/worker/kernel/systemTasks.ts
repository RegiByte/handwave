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
import { detectionKeywords } from '@/core/lib/mediapipe/vocabulary/detectionKeywords'
import type { DetectionBufferLayout } from '@/core/lib/mediapipe/shared/detectionBuffer'
import { createDetectionBufferViews } from '@/core/lib/mediapipe/shared/detectionBuffer'
import type { WorkerSystem } from '@/core/lib/mediapipe/resources/worker/workerSystem'
import { createWorkerSystemConfig } from '@/core/lib/mediapipe/resources/worker/workerSystem'
import {
  displayContextSchema,
  faceLandmarkerConfigSchema,
  gestureRecognizerConfigSchema,
  gridResolutionSchema,
  handSpatialInfoSchema,
  modelPathsSchema,
} from '@/core/lib/mediapipe/vocabulary/detectionSchemas'
import { defineTask } from '@handwave/system'

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
  z.object({
    type: z.literal(detectionKeywords.commands.setGridResolution),
    resolution: z.union([gridResolutionSchema, z.literal('all')]),
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
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
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
    z.object({
      type: z.literal('spatialUpdate'),
      timestamp: z.number(),
      hands: z.array(handSpatialInfoSchema),
    }),
  ]),
  execute: async (_input, { reportProgress }) => {
    if (!workerSystem) {
      throw new Error('System not initialized - call initializeWorker first')
    }

    const loop = workerSystem.workerUpdateLoop

    // Subscribe to loop events and forward as progress
    // Note: Frame results flow via SharedArrayBuffer, not events
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
        case 'error':
          reportProgress({
            type: 'detection',
            event: { type: detectionKeywords.events.error, error: event.error },
          })
          break
        case 'spatialUpdate':
          reportProgress({
            type: 'spatialUpdate',
            timestamp: event.timestamp,
            hands: event.hands,
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
    /**
     * SSR Compatibility Note:
     * 
     * We use z.any() instead of z.instanceof(ImageBitmap) because:
     * 1. ImageBitmap is a browser-only API that doesn't exist in Node.js
     * 2. During SSR/build, even with defaultSsr: false, module evaluation happens server-side
     * 3. z.instanceof(ImageBitmap) would throw "ImageBitmap is not defined" during bundling
     * 
     * This is safe because:
     * - parseIO: false means Zod doesn't validate this at runtime anyway
     * - The actual code only runs client-side (Workers API is browser-only)
     * - TypeScript still enforces the correct type at compile time
     */
    frame: z.any(), // Actually ImageBitmap, but z.instanceof() breaks SSR builds
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

    // TypeScript knows this is ImageBitmap from the function signature
    workerSystem.workerDetectors.pushFrame(input.frame as ImageBitmap, input.timestamp)

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
        // Worker now runs at maximum speed - targetFPS is informational only
        workerSystem.workerStore.setDetectionSettings({
          targetFPS: command.fps,
        })
        console.log(
          `[SystemTasks] Note: Worker runs at maximum speed. targetFPS (${command.fps}) is for reference only.`,
        )
        break
      case detectionKeywords.commands.setDetectionSettings:
        workerSystem.workerStore.setDetectionSettings({
          detectFace: command.detectFace,
          detectHands: command.detectHands,
        })
        break
      case detectionKeywords.commands.setGridResolution:
        workerSystem.workerStore.setGridResolution(command.resolution)
        break
    }

    return Promise.resolve({ dispatched: true })
  },
})

/**
 * Attach SharedArrayBuffer for zero-copy detection results
 * Main thread creates the buffer and sends it to worker
 */
export const attachSharedBufferTask = defineTask({
  input: z.object({
    /**
     * SSR Compatibility Note:
     * 
     * We use z.any() instead of z.instanceof(SharedArrayBuffer) for the same
     * reasons as ImageBitmap above - SharedArrayBuffer exists in Node.js but
     * z.instanceof() still causes issues during module evaluation in the build.
     * 
     * This is safe because the buffer is only used in worker context (browser-only).
     */
    buffer: z.any(), // Actually SharedArrayBuffer
    layout: z.object({
      totalBytes: z.number(),
      singleBufferSize: z.number(),
      bufferIndexOffset: z.number(),
      buffer0TimestampOffset: z.number(),
      buffer0FaceCountOffset: z.number(),
      buffer0HandCountOffset: z.number(),
      buffer0WorkerFPSOffset: z.number(),
      buffer0FacesOffset: z.number(),
      buffer0HandsOffset: z.number(),
      buffer1TimestampOffset: z.number(),
      buffer1FaceCountOffset: z.number(),
      buffer1HandCountOffset: z.number(),
      buffer1WorkerFPSOffset: z.number(),
      buffer1FacesOffset: z.number(),
      buffer1HandsOffset: z.number(),
      faceDataBytes: z.number(),
      handDataBytes: z.number(),
      faceLandmarksBytes: z.number(),
      blendshapesBytes: z.number(),
      transformationMatrixBytes: z.number(),
      handLandmarksBytes: z.number(),
      worldLandmarksBytes: z.number(),
    }),
  }),
  output: z.object({
    attached: z.boolean(),
    bufferSize: z.number(),
  }),
  parseIO: false, // SharedArrayBuffer can't be parsed by Zod
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error('System not initialized - call initializeWorker first')
    }

    console.log('[SystemTasks] Attaching SharedArrayBuffer...', {
      size: input.buffer.byteLength,
    })

    // Create views from the shared buffer
    const views = createDetectionBufferViews(
      input.buffer,
      input.layout as DetectionBufferLayout,
    )

    // Store views in worker store
    workerSystem.workerStore.setSharedBufferViews(views)

    console.log('[SystemTasks] ✅ SharedArrayBuffer attached')

    return Promise.resolve({
      attached: true,
      bufferSize: input.buffer.byteLength,
    })
  },
})

/**
 * Update viewport dimensions
 * Main thread sends viewport info when canvas/window resizes
 */
export const updateViewportTask = defineTask({
  input: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  output: z.object({
    updated: z.boolean(),
  }),
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error('System not initialized - call initializeWorker first')
    }

    workerSystem.workerStore.setViewport(input)

    return Promise.resolve({
      updated: true,
    })
  },
})

/**
 * Set grid resolution for spatial tracking
 * Main thread sends resolution changes to sync with worker
 */
export const setGridResolutionTask = defineTask({
  input: z.object({
    resolution: z.union([gridResolutionSchema, z.literal('all')]),
  }),
  output: z.object({
    updated: z.boolean(),
  }),
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error('System not initialized - call initializeWorker first')
    }

    workerSystem.workerStore.setGridResolution(input.resolution)

    return Promise.resolve({
      updated: true,
    })
  },
})

/**
 * Update display context (dead zones, mirrored)
 * Main thread syncs display state so worker calculates in same coordinate space
 */
export const updateDisplayContextTask = defineTask({
  input: displayContextSchema,
  output: z.object({
    updated: z.boolean(),
  }),
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error('System not initialized - call initializeWorker first')
    }

    console.log('[SystemTasks] Updating display context:', input)
    workerSystem.workerStore.setDisplayContext(input)

    return Promise.resolve({
      updated: true,
    })
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
  [detectionKeywords.tasks.attachSharedBuffer]: attachSharedBufferTask,
  [detectionKeywords.tasks.updateViewport]: updateViewportTask,
  [detectionKeywords.tasks.command]: commandTask,
  [detectionKeywords.tasks.setGridResolution]: setGridResolutionTask,
  [detectionKeywords.tasks.updateDisplayContext]: updateDisplayContextTask,
} as const

export type SystemTasks = typeof systemTasks

/**
 * Recording Resource
 *
 * Captures MediaPipe detection frames with spatial context for test data generation.
 * Records gesture data, hand positions, grid cells, and timing into structured JSON.
 *
 * Philosophy: Real data drives tests. Record interactions, extract fixtures, test reality.
 */

import { defineResource } from 'braided'
import type { StartedResource } from 'braided'
import type { HandCellInfo, RecordedFrame, RecordingSession } from '@handwave/intent-engine'
import { normalizedToCellByResolution } from '@handwave/intent-engine'
import { createAtom } from '@handwave/system'
import type { DetectionWorkerResource, LoopResource } from '@handwave/mediapipe'

// ============================================================================
// Types
// ============================================================================

type RecordingState = {
  isRecording: boolean
  sessionId: string | null
  startTime: number | null
  frameBuffer: Array<RecordedFrame>
  frameIndex: number
  maxFrames: number
  description: string | undefined
}

// ============================================================================
// Resource Definition
// ============================================================================

export const recordingResource = defineResource({
  dependencies: ['loop', 'detectionWorker'],
  start: ({
    loop,
    detectionWorker,
  }: {
    loop: LoopResource
    detectionWorker: DetectionWorkerResource
  }) => {
    console.log('[Recording] Starting...')

    // Recording state
    const state = createAtom<RecordingState>({
      isRecording: false,
      sessionId: null,
      startTime: null,
      frameBuffer: [],
      frameIndex: 0,
      maxFrames: 300, // ~10 seconds at 30 FPS
      description: undefined,
    })

    // Subscribe to loop frame events
    let unsubscribeLoop: (() => void) | null = null

    /**
     * Generate a unique session ID
     */
    const generateSessionId = (): string => {
      const timestamp = Date.now()
      const random = Math.random().toString(36).substring(2, 8)
      return `session-${timestamp}-${random}`
    }


    /**
     * Extract hand cell information from canonical detection frame
     */
    const extractHandCells = (
      detectionFrame: any,
      gridConfig: { cols: number; rows: number },
      deadZones: {
        top: number
        bottom: number
        left: number
        right: number
      },
      mirrored: boolean
    ): Array<HandCellInfo> => {
      const hands = detectionFrame?.detectors?.hand
      if (!hands || hands.length === 0) return []

      const handCells: Array<HandCellInfo> = []

      // Default grid presets (matching grid.ts)
      const gridPresets = {
        coarse: { cols: 6, rows: 4 },
        medium: { cols: 12, rows: 8 },
        fine: { cols: 24, rows: 16 },
      }

      for (const hand of hands) {
        const landmarks = hand.landmarks
        if (!landmarks || landmarks.length < 9) continue

        // Use index finger tip (landmark 8)
        const indexTip = landmarks[8]
        let rawX = indexTip.x
        const rawY = indexTip.y

        // Apply mirroring in raw space (0-1)
        if (mirrored) {
          rawX = 1 - rawX
        }

        // Apply dead zone transformation
        const safeNormalizedX =
          (rawX - deadZones.left) /
          (1 - deadZones.left - deadZones.right)
        const safeNormalizedY =
          (rawY - deadZones.top) / (1 - deadZones.top - deadZones.bottom)

        // Clamp to [0, 1]
        const clampedX = Math.max(0, Math.min(1, safeNormalizedX))
        const clampedY = Math.max(0, Math.min(1, safeNormalizedY))

        const position = {
          x: clampedX,
          y: clampedY,
          z: indexTip.z,
        }

        // Calculate cell for the current grid config (from spatial context)
        const cell = normalizedToCellByResolution(
          position,
          gridConfig.cols === 12 ? 'medium' : 'coarse',
          gridPresets
        )

        handCells.push({
          handIndex: hand.handIndex,
          cell,
          position,
          gridResolution:
            gridConfig.cols === 12 ? 'medium' : 'coarse',
        })
      }

      return handCells
    }

    /**
     * Record a single frame
     */
    const recordFrame = (frameData: any) => {
      const currentState = state.get()
      if (!currentState.isRecording) return

      // frameData contains enriched detection frame
      const detectionFrame = frameData.detectionFrame
      if (!detectionFrame) return

      const timestamp = frameData.timestamp

      // Get loop state for context
      const loopState = loop.state.get()
      const gridConfig = { cols: 12, rows: 8 } // Default medium grid

      // Get dead zones (use defaults matching Session 20)
      const deadZones = {
        top: 0.05,
        bottom: 0.15,
        left: 0.05,
        right: 0.05,
      }

      // Calculate viewport (simple letterbox calculation)
      // Assuming video is 640x480 and canvas dimensions from frame data
      const viewport = {
        x: 0,
        y: 0,
        width: 640, // Will be overridden by actual canvas size
        height: 480,
      }

      // Extract hand cells
      const handCells = extractHandCells(
        detectionFrame,
        gridConfig,
        deadZones,
        loopState.mirrored
      )

      // Get worker FPS from detection worker
      const detectionResults = detectionWorker.readDetectionResults()
      const workerFPS = detectionResults?.workerFPS || 0

      // Create recorded frame with canonical detection data
      const recordedFrame: RecordedFrame = {
        timestamp,
        frameIndex: currentState.frameIndex,
        detectionFrame, // Canonical EnrichedDetectionFrame
        spatial: {
          grid: gridConfig,
          deadZones,
          mirrored: loopState.mirrored,
          viewport,
          handCells,
        },
        performance: {
          workerFPS,
          mainFPS: loopState.fps,
        },
      }

      // Add to buffer (ring buffer behavior)
      state.mutate((s) => {
        s.frameBuffer.push(recordedFrame)
        if (s.frameBuffer.length > s.maxFrames) {
          s.frameBuffer.shift() // Remove oldest
        }
        s.frameIndex++
      })
    }

    /**
     * Start recording
     */
    const startRecording = (description?: string) => {
      const currentState = state.get()
      if (currentState.isRecording) {
        console.warn('[Recording] Already recording')
        return
      }

      const sessionId = generateSessionId()
      const startTime = Date.now()

      state.mutate((s) => {
        s.isRecording = true
        s.sessionId = sessionId
        s.startTime = startTime
        s.frameBuffer = []
        s.frameIndex = 0
        s.description = description
      })

      // Subscribe to loop frames
      if (loop.frame$) {
        unsubscribeLoop = loop.frame$.subscribe(recordFrame)
      }

      console.log(
        `[Recording] Started session ${sessionId}`,
        description ? `"${description}"` : ''
      )
    }

    /**
     * Stop recording and return session
     */
    const stopRecording = (): RecordingSession => {
      const currentState = state.get()
      if (!currentState.isRecording) {
        throw new Error('Not currently recording')
      }

      const endTime = Date.now()

      // Unsubscribe from loop
      if (unsubscribeLoop) {
        unsubscribeLoop()
        unsubscribeLoop = null
      }

      // Create session object
      const session: RecordingSession = {
        sessionId: currentState.sessionId!,
        startTime: currentState.startTime!,
        endTime,
        frameCount: currentState.frameBuffer.length,
        frames: [...currentState.frameBuffer],
        metadata: {
          gridResolutions: ['coarse', 'medium', 'fine'],
          description: currentState.description,
        },
      }

      // Reset state
      state.mutate((s) => {
        s.isRecording = false
        s.sessionId = null
        s.startTime = null
        s.frameBuffer = []
        s.frameIndex = 0
        s.description = undefined
      })

      console.log(
        `[Recording] Stopped session ${session.sessionId}`,
        `${session.frameCount} frames`
      )

      return session
    }

    /**
     * Check if currently recording
     */
    const isRecording = (): boolean => {
      return state.get().isRecording
    }

    /**
     * Get recorded frames
     */
    const getRecordedFrames = (): Array<RecordedFrame> => {
      return [...state.get().frameBuffer]
    }

    /**
     * Get frame count
     */
    const getFrameCount = (): number => {
      return state.get().frameBuffer.length
    }

    /**
     * Export session to JSON string
     */
    const exportToJSON = (): string => {
      if (!state.get().isRecording) {
        throw new Error('Not currently recording')
      }
      const session = stopRecording()
      return JSON.stringify(session, null, 2)
    }

    /**
     * Export current session without stopping
     */
    const exportSession = (): RecordingSession => {
      const currentState = state.get()
      if (!currentState.isRecording) {
        throw new Error('Not currently recording')
      }

      return {
        sessionId: currentState.sessionId!,
        startTime: currentState.startTime!,
        endTime: Date.now(),
        frameCount: currentState.frameBuffer.length,
        frames: [...currentState.frameBuffer],
        metadata: {
          gridResolutions: ['coarse', 'medium', 'fine'],
          description: currentState.description,
        },
      }
    }

    /**
     * Set maximum frames to buffer
     */
    const setMaxFrames = (max: number) => {
      state.mutate((s) => {
        s.maxFrames = max
        // Trim buffer if needed
        if (s.frameBuffer.length > max) {
          s.frameBuffer = s.frameBuffer.slice(-max)
        }
      })
    }

    /**
     * Clear buffer
     */
    const clearBuffer = () => {
      state.mutate((s) => {
        s.frameBuffer = []
        s.frameIndex = 0
      })
    }

    console.log('[Recording] Ready')

    return {
      // State
      state,

      // Control
      startRecording,
      stopRecording,
      isRecording,

      // State access
      getRecordedFrames,
      getFrameCount,

      // Export
      exportToJSON,
      exportSession,

      // Configuration
      setMaxFrames,
      clearBuffer,
    }
  },
  halt: () => {
    console.log('[Recording] Halting...')
  },
})

// ============================================================================
// Type Exports
// ============================================================================

export type RecordingResource = StartedResource<typeof recordingResource>


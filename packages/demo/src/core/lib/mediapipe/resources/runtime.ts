/**
 * Runtime Resource
 *
 * Central orchestration layer for the MediaPipe system.
 * All imperative commands from React flow through this resource.
 * Coordinates between camera, loop, and other resources without tight coupling.
 */

import type { StartedResource } from 'braided'
import { defineResource } from 'braided'
import type { GridResolution } from '@handwave/intent-engine'
import type { CameraAPI } from './camera'
import type { LoopResource } from './loop'
import type { DetectionWorkerResource } from './detectionWorker'
import {
  DEAD_ZONE,
  blendshapesDisplayTask,
  createFpsTask,
  createGestureDurationTask,
  createMultiGridOverlayTask,
  createParticlesTask,
  createPauseIndicatorTask,
  createPinchRingsTask,
  createVideoBackdropTask,
  faceLandmarkLabelsTask,
  faceMeshTask,
  gestureLabelsTask,
  handCoordinatesTask,
  handSkeletonTasks,
  videoForegroundTask,
} from './tasks'
import type { RenderTask } from './tasks/types'
import type { IntentEngineAPI } from '@/core/lib/intent/resources/intentEngineResource'
import type { FrameHistoryAPI } from '@/core/lib/intent'
import type {
  MediaPipeCommand,
  MediaPipeEvent,
} from '@/core/lib/mediapipe/vocabulary/schemas'
import type { SpatialUpdateMessage } from '@/core/lib/mediapipe/vocabulary/detectionSchemas'
import { mediapipeKeywords } from '@/core/lib/mediapipe/vocabulary/keywords'
import { detectionKeywords } from '@/core/lib/mediapipe/vocabulary/detectionKeywords'

import { createChannel } from '@/core/lib/channel'
import { createAtom } from '@handwave/system'
import { particleIntentsV2 } from '@/core/lib/intent/intents/particleIntents'

// ============================================================================
// Types
// ============================================================================

export type RuntimeState = {
  initialized: boolean
  running: boolean
  paused: boolean
  mirrored: boolean
  debugMode: boolean
  gridOverlay: boolean
  gridResolution: GridResolution | 'all'
  particlesEnabled: boolean
  videoDevices: Array<MediaDeviceInfo>
  audioDevices: Array<MediaDeviceInfo>
  selectedVideoDeviceId: string
  selectedAudioDeviceId: string
  spatial: {
    latestUpdate: SpatialUpdateMessage | null
    lastUpdateTime: number
  }
}

type CommandHandler<TCommand extends MediaPipeCommand['type']> = (
  command: Extract<MediaPipeCommand, { type: TCommand }>,
) => void | Promise<void>

type CommandHandlers = {
  [Key in MediaPipeCommand['type']]: CommandHandler<Key>
}

// ============================================================================
// Constants
// ============================================================================

const VIDEO_DEVICE_KEY = 'mediapipe.videoDeviceId'
const AUDIO_DEVICE_KEY = 'mediapipe.audioDeviceId'

// ============================================================================
// Resource Definition
// ============================================================================

export const runtimeResource = defineResource({
  dependencies: ['camera', 'loop', 'detectionWorker', 'frameHistory', 'intentEngine'],
  start: ({
    camera,
    loop,
    detectionWorker,
    frameHistory,
    intentEngine,
  }: {
    camera: CameraAPI
    loop: LoopResource
    detectionWorker: DetectionWorkerResource
    frameHistory: FrameHistoryAPI
    intentEngine: IntentEngineAPI
  }) => {
    // Create command/event channel
    const channel = createChannel<MediaPipeCommand, MediaPipeEvent>()

    // Create runtime state atom
    const state = createAtom<RuntimeState>({
      initialized: false,
      running: false,
      paused: false,
      mirrored: true, // Default to mirrored (selfie mode, matches loop default)
      debugMode: true,
      gridOverlay: false,
      gridResolution: 'medium',
      particlesEnabled: true, // Particles enabled by default
      videoDevices: [],
      audioDevices: [],
      selectedVideoDeviceId: '',
      selectedAudioDeviceId: '',
      spatial: {
        latestUpdate: null,
        lastUpdateTime: 0,
      },
    })

    // Track render task unsubscribers
    const renderTaskUnsubscribers: Array<() => void> = []

    // ========================================================================
    // Device Management
    // ========================================================================

    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter((d) => d.kind === 'videoinput')
        const audioInputs = devices.filter((d) => d.kind === 'audioinput')

        const currentVideoId = camera.stream
          .getVideoTracks()[0]
          ?.getSettings().deviceId
        const currentAudioId = camera.stream
          .getAudioTracks()[0]
          ?.getSettings().deviceId

        const storedVideoId = localStorage.getItem(VIDEO_DEVICE_KEY) || ''
        const storedAudioId = localStorage.getItem(AUDIO_DEVICE_KEY) || ''

        const preferredVideoId =
          videoInputs.find((d) => d.deviceId === storedVideoId)?.deviceId ||
          currentVideoId ||
          videoInputs[0]?.deviceId ||
          ''

        const preferredAudioId =
          audioInputs.find((d) => d.deviceId === storedAudioId)?.deviceId ||
          currentAudioId ||
          ''

        state.mutate((s) => {
          s.videoDevices = videoInputs
          s.audioDevices = audioInputs
          s.selectedVideoDeviceId = preferredVideoId
          s.selectedAudioDeviceId = preferredAudioId
        })

        // Apply preferred devices if different from current
        if (preferredVideoId && preferredVideoId !== currentVideoId) {
          await camera.setDevices({ videoDeviceId: preferredVideoId })
        }
        if (preferredAudioId && preferredAudioId !== currentAudioId) {
          await camera.setDevices({
            audioDeviceId: preferredAudioId,
            enableAudio: true,
          })
        }

        channel.out.notify({
          type: mediapipeKeywords.events.devicesEnumerated,
          videoDevices: videoInputs,
          audioDevices: audioInputs,
        })
      } catch (error) {
        console.error('[Runtime] Failed to load devices:', error)
        channel.out.notify({
          type: mediapipeKeywords.events.error,
          error: 'Failed to enumerate devices',
          meta: error,
        })
      }
    }

    const setupDeviceChangeListener = () => {
      const onDeviceChange = () => {
        loadDevices()
      }
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
      return () => {
        navigator.mediaDevices.removeEventListener(
          'devicechange',
          onDeviceChange,
        )
      }
    }

    // ========================================================================
    // Render Task Setup
    // ========================================================================

    const setupRenderTasks = () => {
      // Clear any existing tasks
      renderTaskUnsubscribers.forEach((unsub) => unsub())
      renderTaskUnsubscribers.length = 0

      const currentState = state.get()

      // Add render tasks in order (first added = first rendered)
      const tasks: Array<RenderTask> = [
        createVideoBackdropTask(), // Blurred backdrop
        videoForegroundTask, // Sharp video at full FPS
        faceMeshTask,
        // faceMeshIndicesTask,
        // handLandmarksTask,
        gestureLabelsTask,
        // Debug tasks
        ...handSkeletonTasks,
        // handLandmarkLabelsTask,
        faceLandmarkLabelsTask,
        // smileOverlayTask,
        blendshapesDisplayTask,
        handCoordinatesTask,
        // Intent Engine tasks
        createPinchRingsTask(frameHistory),
        createGestureDurationTask(frameHistory),
        // Particle system (toggleable with 'p' key)
        ...(currentState.particlesEnabled
          ? [createParticlesTask(intentEngine)]
          : []),
        // Grid overlay (toggleable with 'g' key) - now multi-resolution
        ...(currentState.gridOverlay
          ? [
            createMultiGridOverlayTask({
              activeResolution: currentState.gridResolution,
              showDeadZones: true,
              showCellLabels: true,
              showHandPositions: true,
              spatialData: () => state.get().spatial.latestUpdate,
            }),
          ]
          : []),
        createPauseIndicatorTask(loop.state),
        createFpsTask(loop.state),
      ]

      tasks.forEach((task) => {
        renderTaskUnsubscribers.push(loop.addRenderTask(task))
      })
    }

    // ========================================================================
    // Command Handlers
    // ========================================================================

    const commandHandlers: CommandHandlers = {
      [mediapipeKeywords.commands.start]: async () => {
        console.log('[Runtime] Starting system')

        // Load devices first
        await loadDevices()

        // Setup render tasks
        setupRenderTasks()

        // Configure intent engine with v2 particle intents
        intentEngine.configure([...particleIntentsV2])

        // Subscribe to intent events for debugging
        // intentEngine.onAny((event: any) => {
        //   console.log('[Intent Event]', event.type, {
        //     id: event.id,
        //     timestamp: event.timestamp,
        //     position: event.position,
        //     cell: event.cell,
        //     hand: event.hand,
        //     handIndex: event.handIndex,
        //     reason: event.reason,
        //     duration: event.duration,
        //   })
        // })

        // Start the loop (loop will sync display context after worker initializes)
        loop.start()

        state.update(current => ({
          ...current,
          initialized: true,
          running: true,
        }))

        channel.out.notify({ type: mediapipeKeywords.events.started })
      },

      [mediapipeKeywords.commands.stop]: () => {
        console.log('[Runtime] Stopping system')
        loop.stop()

        state.update(current => ({
          ...current,
          running: false,
          paused: false,
        }))

        channel.out.notify({ type: mediapipeKeywords.events.stopped })
      },

      [mediapipeKeywords.commands.pause]: () => {
        console.log('[Runtime] Pausing')
        loop.pause()

        state.update(current => ({
          ...current,
          paused: true,
        }))

        channel.out.notify({ type: mediapipeKeywords.events.paused })
      },

      [mediapipeKeywords.commands.resume]: () => {
        console.log('[Runtime] Resuming')
        loop.resume()

        state.update(current => ({
          ...current,
          paused: false,
        }))

        channel.out.notify({ type: mediapipeKeywords.events.resumed })
      },

      [mediapipeKeywords.commands.togglePause]: () => {
        const isPaused = state.get().paused
        if (isPaused) {
          commandHandlers[mediapipeKeywords.commands.resume]({
            type: mediapipeKeywords.commands.resume,
          })
        } else {
          commandHandlers[mediapipeKeywords.commands.pause]({
            type: mediapipeKeywords.commands.pause,
          })
        }
      },

      [mediapipeKeywords.commands.toggleMirror]: () => {
        console.log('[Runtime] Toggling mirror')
        loop.toggleMirror()

        const mirrored = !state.get().mirrored
        state.set({
          ...state.get(),
          mirrored: mirrored,
        })

        detectionWorker.updateDisplayContext({
          deadZones: DEAD_ZONE,
          mirrored: mirrored,
        })

        channel.out.notify({
          type: mediapipeKeywords.events.mirrorToggled,
          mirrored,
        })
      },

      [mediapipeKeywords.commands.setMirrored]: (command) => {
        console.log('[Runtime] Setting mirrored:', command.mirrored)
        loop.setMirrored(command.mirrored)

        state.update(current => ({
          ...current,
          mirrored: command.mirrored,
        }))

        // Sync mirrored state to worker for correct coordinate space calculations
        detectionWorker.updateDisplayContext({
          deadZones: DEAD_ZONE,
          mirrored: command.mirrored,
        })

        channel.out.notify({
          type: mediapipeKeywords.events.mirrorToggled,
          mirrored: command.mirrored,
        })
      },

      [mediapipeKeywords.commands.setVideoDevice]: async (command) => {
        console.log('[Runtime] Setting video device:', command.deviceId)

        state.update(current => ({
          ...current,
          selectedVideoDeviceId: command.deviceId,
        }))

        localStorage.setItem(VIDEO_DEVICE_KEY, command.deviceId)
        await camera.setDevices({ videoDeviceId: command.deviceId })

        channel.out.notify({
          type: mediapipeKeywords.events.videoDeviceChanged,
          deviceId: command.deviceId,
        })
      },

      [mediapipeKeywords.commands.setAudioDevice]: async (command) => {
        console.log('[Runtime] Setting audio device:', command.deviceId)

        state.update(current => ({
          ...current,
          selectedAudioDeviceId: command.deviceId || '',
        }))

        localStorage.setItem(AUDIO_DEVICE_KEY, command.deviceId || '')
        await camera.setDevices({
          audioDeviceId: command.deviceId,
          enableAudio: command.enableAudio,
        })

        channel.out.notify({
          type: mediapipeKeywords.events.audioDeviceChanged,
          deviceId: command.deviceId,
        })
      },

      [mediapipeKeywords.commands.toggleDebugMode]: () => {
        const debugMode = !state.get().debugMode
        console.log('[Runtime] Toggling debug mode:', debugMode)

        state.update(current => ({
          ...current,
          debugMode: debugMode,
        }))

        channel.out.notify({
          type: mediapipeKeywords.events.debugModeToggled,
          enabled: debugMode,
        })
      },

      [mediapipeKeywords.commands.toggleGridOverlay]: () => {
        const gridOverlay = !state.get().gridOverlay
        console.log('[Runtime] Toggling grid overlay:', gridOverlay)

        state.update(current => ({
          ...current,
          gridOverlay: gridOverlay,
        }))

        // Rebuild render tasks to add/remove grid overlay
        setupRenderTasks()

        channel.out.notify({
          type: mediapipeKeywords.events.gridOverlayToggled,
          enabled: gridOverlay,
        })
      },

      [mediapipeKeywords.commands.setGridResolution]: (command) => {
        console.log('[Runtime] Setting grid resolution:', command.resolution)

        state.mutate((s) => {
          s.gridResolution = command.resolution
          s.spatial.latestUpdate = null // Clear stale spatial data
        })

        // Send to worker to sync grid resolution
        detectionWorker.dispatch(detectionKeywords.tasks.setGridResolution, {
          resolution: command.resolution,
        })

        // Rebuild render tasks with new resolution
        setupRenderTasks()

        channel.out.notify({
          type: mediapipeKeywords.events.gridResolutionChanged,
          resolution: command.resolution,
        })
      },

      // Debug toggles - these would need additional state tracking
      // For now, they're placeholders
      [mediapipeKeywords.commands.toggleHandLandmarkLabels]: () => {
        console.log('[Runtime] Toggle hand landmark labels')
      },

      [mediapipeKeywords.commands.toggleFaceLandmarkLabels]: () => {
        console.log('[Runtime] Toggle face landmark labels')
      },

      [mediapipeKeywords.commands.toggleBlendshapesDisplay]: () => {
        console.log('[Runtime] Toggle blendshapes display')
      },

      [mediapipeKeywords.commands.toggleHandCoordinates]: () => {
        console.log('[Runtime] Toggle hand coordinates')
      },
      [mediapipeKeywords.commands.toggleVideoForeground]: () => {
        console.log('[Runtime] Toggle video foreground')
        loop.toggleRendering('videoForeground')
      },
      [mediapipeKeywords.commands.toggleParticles]: () => {
        console.log('[Runtime] Toggle particles')
        const particlesEnabled = !state.get().particlesEnabled
        state.update(current => ({
          ...current,
          particlesEnabled,
        }))

        // Rebuild render tasks to add/remove particle task
        setupRenderTasks()

        channel.out.notify({
          type: mediapipeKeywords.events.particlesToggled,
          particlesEnabled,
        })
      },
    }

    // ========================================================================
    // Channel Worker
    // ========================================================================

    const unsubscribeWorker = channel.work((command, resolve) => {
      const handler = commandHandlers[command.type]
      if (!handler) {
        const error = `No handler found for command: ${command.type}`
        console.error('[Runtime]', error)
        resolve({
          type: mediapipeKeywords.events.error,
          error,
          meta: command,
        })
        return
      }

      try {
        const result = handler(command as never)
        // Handle async commands
        if (result instanceof Promise) {
          result.catch((error) => {
            resolve({
              type: mediapipeKeywords.events.error,
              error: error instanceof Error ? error.message : 'Unknown error',
              meta: error,
            })
          })
        }
      } catch (error) {
        resolve({
          type: mediapipeKeywords.events.error,
          error: error instanceof Error ? error.message : 'Unknown error',
          meta: error,
        })
      }
    })

    // ========================================================================
    // Initialization
    // ========================================================================

    const deviceChangeCleanup = setupDeviceChangeListener()

    // Subscribe to spatial updates from detection worker
    const unsubscribeSpatialUpdates = detectionWorker.onSpatialUpdate(
      (spatialUpdate) => {
        state.mutate((s) => {
          s.spatial.latestUpdate = spatialUpdate
          s.spatial.lastUpdateTime = spatialUpdate.timestamp
        })

        // Emit event for future intent engine integration
        channel.out.notify({
          type: mediapipeKeywords.events.spatialUpdate,
          timestamp: spatialUpdate.timestamp,
          hands: spatialUpdate.hands,
        } as any)
      },
    )

    // Subscribe to workerReady event from loop
    // This is the proper time to sync display context to worker
    const unsubscribeWorkerReady = loop.workerReady$.subscribe(() => {
      console.log('[Runtime] Worker ready! Syncing display context...')

      // Sync display context now that worker is initialized
      detectionWorker.updateDisplayContext({
        deadZones: DEAD_ZONE,
        mirrored: state.get().mirrored, // Use runtime state
      })

      // Emit workerReady event for external consumers
      channel.out.notify({
        type: mediapipeKeywords.events.workerReady,
      } as any)
    })

    // ========================================================================
    // API
    // ========================================================================

    const api = {
      state,
      channel,

      // Command dispatching
      dispatch: (command: MediaPipeCommand) => {
        setTimeout(() => {
          channel.put(command)
        }, 0)
      },

      dispatchImmediate: (command: MediaPipeCommand) => {
        channel.put(command)
      },

      // Event watching
      watch: channel.watch,

      // Convenience commands
      commands: {
        start: () => api.dispatch({ type: mediapipeKeywords.commands.start }),
        stop: () => api.dispatch({ type: mediapipeKeywords.commands.stop }),
        pause: () => api.dispatch({ type: mediapipeKeywords.commands.pause }),
        resume: () => api.dispatch({ type: mediapipeKeywords.commands.resume }),
        togglePause: () =>
          api.dispatch({ type: mediapipeKeywords.commands.togglePause }),
        toggleMirror: () =>
          api.dispatch({ type: mediapipeKeywords.commands.toggleMirror }),
        setMirrored: (mirrored: boolean) =>
          api.dispatch({
            type: mediapipeKeywords.commands.setMirrored,
            mirrored,
          }),
        setVideoDevice: (deviceId: string) =>
          api.dispatch({
            type: mediapipeKeywords.commands.setVideoDevice,
            deviceId,
          }),
        setAudioDevice: (deviceId: string | null, enableAudio: boolean) =>
          api.dispatch({
            type: mediapipeKeywords.commands.setAudioDevice,
            deviceId,
            enableAudio,
          }),
        toggleDebugMode: () =>
          api.dispatch({ type: mediapipeKeywords.commands.toggleDebugMode }),
        toggleGridOverlay: () =>
          api.dispatch({ type: mediapipeKeywords.commands.toggleGridOverlay }),
        setGridResolution: (resolution: GridResolution | 'all') =>
          api.dispatch({
            type: mediapipeKeywords.commands.setGridResolution,
            resolution,
          }),
        toggleVideoForeground: () =>
          api.dispatch({
            type: mediapipeKeywords.commands.toggleVideoForeground,
          }),
        toggleParticles: () =>
          api.dispatch({
            type: mediapipeKeywords.commands.toggleParticles,
          }),
      },

      // Cleanup
      cleanup: () => {
        console.log('[Runtime] Cleaning up')
        unsubscribeSpatialUpdates()
        unsubscribeWorkerReady()
        unsubscribeWorker()
        deviceChangeCleanup()
        renderTaskUnsubscribers.forEach((unsub) => unsub())
        renderTaskUnsubscribers.length = 0
        channel.clear()
      },
    }

    return api
  },
  halt: ({ cleanup }) => {
    cleanup()
  },
})

export type RuntimeAPI = StartedResource<typeof runtimeResource>

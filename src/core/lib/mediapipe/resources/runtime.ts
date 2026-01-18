/**
 * Runtime Resource
 *
 * Central orchestration layer for the MediaPipe system.
 * All imperative commands from React flow through this resource.
 * Coordinates between camera, loop, and other resources without tight coupling.
 */

import type { StartedResource } from 'braided'
import { defineResource } from 'braided'
import type { CameraAPI } from './camera'
import type { LoopAPI } from './loop'
import {
  blendshapesDisplayTask,
  createFpsTask,
  createPauseIndicatorTask,
  createVideoBackdropTask,
  faceLandmarkLabelsTask,
  faceMeshIndicesTask,
  faceMeshTask,
  fingertipsConnectorsTask,
  gestureLabelsTask,
  gridOverlayTask,
  handCoordinatesTask,
  handLandmarkLabelsTask,
  handLandmarksTask,
  handSkeletonTask,
  handSkeletonTasks,
  palmHighlightTask,
  smileOverlayTask,
  videoForegroundTask,
} from './tasks'
import type { RenderTask } from './tasks/types'
import type { MediaPipeCommand, MediaPipeEvent } from '@/core/lib/mediapipe/vocabulary/schemas'
import { mediapipeKeywords } from '@/core/lib/mediapipe/vocabulary/keywords'

import { createChannel } from '@/core/lib/channel'
import { createAtom } from '@/core/lib/state'

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
  videoDevices: Array<MediaDeviceInfo>
  audioDevices: Array<MediaDeviceInfo>
  selectedVideoDeviceId: string
  selectedAudioDeviceId: string
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
  dependencies: ['camera', 'loop'],
  start: ({ camera, loop }: { camera: CameraAPI; loop: LoopAPI }) => {
    // Create command/event channel
    const channel = createChannel<MediaPipeCommand, MediaPipeEvent>()

    // Create runtime state atom
    const state = createAtom<RuntimeState>({
      initialized: false,
      running: false,
      paused: false,
      mirrored: false,
      debugMode: true,
      gridOverlay: false,
      videoDevices: [],
      audioDevices: [],
      selectedVideoDeviceId: '',
      selectedAudioDeviceId: '',
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
        smileOverlayTask,
        blendshapesDisplayTask,
        handCoordinatesTask,
        // Grid overlay (toggleable with 'g' key)
        ...(currentState.gridOverlay ? [gridOverlayTask] : []),
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

        // Start the loop
        loop.start()

        state.mutate((s) => {
          s.initialized = true
          s.running = true
        })

        channel.out.notify({ type: mediapipeKeywords.events.started })
      },

      [mediapipeKeywords.commands.stop]: () => {
        console.log('[Runtime] Stopping system')
        loop.stop()

        state.mutate((s) => {
          s.running = false
          s.paused = false
        })

        channel.out.notify({ type: mediapipeKeywords.events.stopped })
      },

      [mediapipeKeywords.commands.pause]: () => {
        console.log('[Runtime] Pausing')
        loop.pause()

        state.mutate((s) => {
          s.paused = true
        })

        channel.out.notify({ type: mediapipeKeywords.events.paused })
      },

      [mediapipeKeywords.commands.resume]: () => {
        console.log('[Runtime] Resuming')
        loop.resume()

        state.mutate((s) => {
          s.paused = false
        })

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
        state.mutate((s) => {
          s.mirrored = mirrored
        })

        channel.out.notify({
          type: mediapipeKeywords.events.mirrorToggled,
          mirrored,
        })
      },

      [mediapipeKeywords.commands.setMirrored]: (command) => {
        console.log('[Runtime] Setting mirrored:', command.mirrored)
        loop.setMirrored(command.mirrored)

        state.mutate((s) => {
          s.mirrored = command.mirrored
        })

        channel.out.notify({
          type: mediapipeKeywords.events.mirrorToggled,
          mirrored: command.mirrored,
        })
      },

      [mediapipeKeywords.commands.setVideoDevice]: async (command) => {
        console.log('[Runtime] Setting video device:', command.deviceId)

        state.mutate((s) => {
          s.selectedVideoDeviceId = command.deviceId
        })

        localStorage.setItem(VIDEO_DEVICE_KEY, command.deviceId)
        await camera.setDevices({ videoDeviceId: command.deviceId })

        channel.out.notify({
          type: mediapipeKeywords.events.videoDeviceChanged,
          deviceId: command.deviceId,
        })
      },

      [mediapipeKeywords.commands.setAudioDevice]: async (command) => {
        console.log('[Runtime] Setting audio device:', command.deviceId)

        state.mutate((s) => {
          s.selectedAudioDeviceId = command.deviceId || ''
        })

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

        state.mutate((s) => {
          s.debugMode = debugMode
        })

        channel.out.notify({
          type: mediapipeKeywords.events.debugModeToggled,
          enabled: debugMode,
        })
      },

      [mediapipeKeywords.commands.toggleGridOverlay]: () => {
        const gridOverlay = !state.get().gridOverlay
        console.log('[Runtime] Toggling grid overlay:', gridOverlay)

        state.mutate((s) => {
          s.gridOverlay = gridOverlay
        })

        // Rebuild render tasks to add/remove grid overlay
        setupRenderTasks()

        channel.out.notify({
          type: mediapipeKeywords.events.gridOverlayToggled,
          enabled: gridOverlay,
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
        toggleVideoForeground: () =>
          api.dispatch({
            type: mediapipeKeywords.commands.toggleVideoForeground,
          }),
      },

      // Cleanup
      cleanup: () => {
        console.log('[Runtime] Cleaning up')
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

/**
 * Runtime Resource (Three.js Demo)
 *
 * Simplified runtime for 3D demo - no 2D rendering tasks, just system orchestration.
 */

import type {
  CameraAPI,
  DetectionWorkerResource,
  LoopResource,
  MediaPipeCommand,
  MediaPipeEvent,
} from '@handwave/mediapipe'
import { mediapipeKeywords } from '@handwave/mediapipe'
import { createAtom, createChannel } from '@handwave/system'
import type { StartedResource } from 'braided'
import { defineResource } from 'braided'
import type { FrameHistoryAPI } from './frameHistoryResource'
import type { IntentEngineAPI } from './intentEngineResource'
import { grabIntent, resizeIntent } from '@/intents/core'

// ============================================================================
// Types
// ============================================================================

export type RuntimeState = {
  initialized: boolean
  running: boolean
  paused: boolean
  mirrored: boolean
  handSkeletonVisible: boolean
  videoDevices: Array<MediaDeviceInfo>
  selectedVideoDeviceId: string
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

// ============================================================================
// Resource Definition
// ============================================================================

export const runtimeResource = defineResource({
  dependencies: ['camera', 'loop', 'detectionWorker', 'frameHistory', 'intentEngine'],
  start: ({
    camera,
    loop,
    detectionWorker,
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
      mirrored: true, // Default to mirrored (selfie mode)
      handSkeletonVisible: true, // Show hand skeleton by default
      videoDevices: [],
      selectedVideoDeviceId: '',
    })

    // ========================================================================
    // Device Management
    // ========================================================================

    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter((d) => d.kind === 'videoinput')

        const currentVideoId = camera.stream
          .getVideoTracks()[0]
          ?.getSettings().deviceId

        const storedVideoId = localStorage.getItem(VIDEO_DEVICE_KEY) || ''

        const preferredVideoId =
          videoInputs.find((d) => d.deviceId === storedVideoId)?.deviceId ||
          currentVideoId ||
          videoInputs[0]?.deviceId ||
          ''

        state.mutate((s) => {
          s.videoDevices = videoInputs
          s.selectedVideoDeviceId = preferredVideoId
        })

        // Apply preferred device if different from current
        if (preferredVideoId && preferredVideoId !== currentVideoId) {
          await camera.setDevices({ videoDeviceId: preferredVideoId })
        }

        channel.out.notify({
          type: mediapipeKeywords.events.devicesEnumerated,
          videoDevices: videoInputs,
          audioDevices: [],
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
    // Command Handlers
    // ========================================================================

    const commandHandlers: CommandHandlers = {
      [mediapipeKeywords.commands.start]: async () => {
        // Load devices first
        await loadDevices()

        // Setup render tasks
        setupRenderTasks()

        // Configure intent engine with grab and resize intents
        intentEngine.configure([grabIntent, resizeIntent])

        // Start the loop
        loop.start()

        state.update((current) => ({
          ...current,
          initialized: true,
          running: true,
        }))

        channel.out.notify({ type: mediapipeKeywords.events.started })
      },

      [mediapipeKeywords.commands.stop]: () => {
        loop.stop()

        state.update((current) => ({
          ...current,
          running: false,
          paused: false,
        }))

        channel.out.notify({ type: mediapipeKeywords.events.stopped })
      },

      [mediapipeKeywords.commands.pause]: () => {
        loop.pause()
        camera.pause() // Pause video playback

        state.update((current) => ({
          ...current,
          paused: true,
        }))

        channel.out.notify({ type: mediapipeKeywords.events.paused })
      },

      [mediapipeKeywords.commands.resume]: () => {
        loop.resume()
        camera.resume() // Resume video playback

        state.update((current) => ({
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
        loop.toggleMirror()

        const mirrored = !state.get().mirrored
        state.set({
          ...state.get(),
          mirrored: mirrored,
        })

        channel.out.notify({
          type: mediapipeKeywords.events.mirrorToggled,
          mirrored,
        })
      },

      [mediapipeKeywords.commands.setMirrored]: (command) => {
        loop.setMirrored(command.mirrored)

        state.update((current) => ({
          ...current,
          mirrored: command.mirrored,
        }))

        channel.out.notify({
          type: mediapipeKeywords.events.mirrorToggled,
          mirrored: command.mirrored,
        })
      },

      [mediapipeKeywords.commands.setVideoDevice]: async (command) => {
        state.update((current) => ({
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

      [mediapipeKeywords.commands.toggleDebugMode]: () => {
        // Toggle hand skeleton visibility
        const handSkeletonVisible = !state.get().handSkeletonVisible
        state.update((current) => ({
          ...current,
          handSkeletonVisible,
        }))
        console.log('[Runtime] Hand skeleton visible:', handSkeletonVisible)
      },

      // Stub handlers for commands we don't need in 3D demo
      [mediapipeKeywords.commands.setAudioDevice]: async () => { },
      [mediapipeKeywords.commands.toggleGridOverlay]: () => { },
      [mediapipeKeywords.commands.setGridResolution]: () => { },
      [mediapipeKeywords.commands.toggleHandLandmarkLabels]: () => { },
      [mediapipeKeywords.commands.toggleFaceLandmarkLabels]: () => { },
      [mediapipeKeywords.commands.toggleBlendshapesDisplay]: () => { },
      [mediapipeKeywords.commands.toggleHandCoordinates]: () => { },
      [mediapipeKeywords.commands.toggleVideoForeground]: () => { },
      [mediapipeKeywords.commands.toggleParticles]: () => { },
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

    // Subscribe to workerReady event from loop
    // This is the proper time to sync display context to worker
    const unsubscribeWorkerReady = loop.workerReady$.subscribe(() => {
      // Sync display context now that worker is initialized
      detectionWorker.updateDisplayContext({
        deadZones: { top: 0, bottom: 0, left: 0, right: 0 }, // No dead zones for 3D demo
        mirrored: state.get().mirrored,
      })

      channel.out.notify({
        type: mediapipeKeywords.events.workerReady,
      } as any)
    })

    // Track render task unsubscribers
    const renderTaskUnsubscribers: Array<() => void> = []

    // Setup render tasks - called when system starts
    const setupRenderTasks = () => {
      // Clear any existing tasks
      renderTaskUnsubscribers.forEach((unsub) => unsub())
      renderTaskUnsubscribers.length = 0

      // Add a no-op render task to keep the loop running
      // The loop needs at least one task to execute the render pipeline
      // All actual rendering happens in Three.js (VideoBackdrop component)
      const noopTask = () => {
        // Do nothing - just keep the loop alive
      }
      
      renderTaskUnsubscribers.push(loop.addRenderTask(noopTask))
    }

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
        toggleHandSkeleton: () =>
          api.dispatch({ type: mediapipeKeywords.commands.toggleDebugMode }),
      },

      // Cleanup
      cleanup: () => {
        unsubscribeWorkerReady()
        renderTaskUnsubscribers.forEach((unsub) => unsub())
        renderTaskUnsubscribers.length = 0
        unsubscribeWorker()
        deviceChangeCleanup()
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

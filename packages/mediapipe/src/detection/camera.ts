import { defineResource } from 'braided'
import { createAtom } from '@handwave/system'
import { useEffect } from 'react'

export type CameraConfig = {
  facingMode?: 'user' | 'environment'
  width?: number
  height?: number
  frameRate?: number
  videoDeviceId?: string
  audioDeviceId?: string
  enableAudio?: boolean
}

export type CameraDeviceSelection = {
  videoDeviceId?: string | null
  audioDeviceId?: string | null
  enableAudio?: boolean
}

export type CameraAPI = {
  stream: MediaStream
  video: HTMLVideoElement
  config: CameraConfig
  stop: () => void
  pause: () => void
  resume: () => void
  setDevices: (selection: CameraDeviceSelection) => Promise<void>
  /**
   * React hook to mount the video element into a container ref
   * Handles mounting, unmounting, and mirroring
   */
  useVideoContainer: (
    containerRef: React.RefObject<HTMLDivElement | null>,
    options?: { mirrored?: boolean },
  ) => void
}

export type CameraState = {
  status: 'idle' | 'requesting' | 'ready' | 'error'
  error: string | null
  videoWidth: number
  videoHeight: number
  streamVersion: number
  videoDeviceId: string | null
  audioDeviceId: string | null
}

export const createCameraResource = (config: CameraConfig = {}) =>
  defineResource({
    dependencies: [],
    start: async () => {
      const {
        facingMode = 'user',
        width = 800,
        height = 600,
        frameRate = 30,
        videoDeviceId,
        audioDeviceId,
        enableAudio = false,
      } = config

      const state = createAtom<CameraState>({
        status: 'idle',
        error: null,
        videoWidth: 0,
        videoHeight: 0,
        streamVersion: 0,
        videoDeviceId: null,
        audioDeviceId: null,
      })

      state.set({ ...state.get(), status: 'requesting' })

      try {
        const buildConstraints = (
          selection: CameraDeviceSelection = {},
        ): MediaStreamConstraints => {
          const {
            videoDeviceId: selectedVideoId,
            audioDeviceId: selectedAudioId,
            enableAudio: selectedAudioEnabled,
          } = selection

          const videoConstraints: MediaTrackConstraints = {
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: frameRate },
          }

          if (selectedVideoId) {
            videoConstraints.deviceId = { exact: selectedVideoId }
          } else {
            videoConstraints.facingMode = facingMode
          }

          let audioConstraints: boolean | MediaTrackConstraints = false
          if (selectedAudioId) {
            audioConstraints = { deviceId: { exact: selectedAudioId } }
          } else if (selectedAudioEnabled) {
            audioConstraints = true
          }

          return { video: videoConstraints, audio: audioConstraints }
        }

        const createStream = async (selection: CameraDeviceSelection = {}) => {
          const constraints = buildConstraints(selection)
          return navigator.mediaDevices.getUserMedia(constraints)
        }

        const video = document.createElement('video')
        video.playsInline = true
        video.autoplay = false
        video.muted = true
        video.width = width
        video.height = height

        let currentSelection: CameraDeviceSelection = {
          videoDeviceId,
          audioDeviceId,
          enableAudio,
        }

        let stream = await createStream(currentSelection)
        video.srcObject = stream

        const awaitVideoReady = () =>
          new Promise<void>((resolve, reject) => {
            const onLoaded = () => resolve()
            const onError = () => reject(new Error('Video failed to load'))
            video.addEventListener('loadedmetadata', onLoaded, { once: true })
            video.addEventListener('error', onError, { once: true })
          })

        await awaitVideoReady()
        await video.play()

        state.set({
          status: 'ready',
          error: null,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          streamVersion: 1,
          videoDeviceId: videoDeviceId ?? null,
          audioDeviceId: audioDeviceId ?? null,
        })

        const replaceStream = async (selection: CameraDeviceSelection) => {
          const nextSelection: CameraDeviceSelection = {
            videoDeviceId:
              selection.videoDeviceId === null
                ? undefined
                : selection.videoDeviceId ?? currentSelection.videoDeviceId,
            audioDeviceId:
              selection.audioDeviceId === null
                ? undefined
                : selection.audioDeviceId ?? currentSelection.audioDeviceId,
            enableAudio:
              selection.enableAudio ?? currentSelection.enableAudio ?? false,
          }

          const nextStream = await createStream(nextSelection)
          // Stop previous tracks
          stream.getTracks().forEach((t) => t.stop())

          stream = nextStream
          currentSelection = nextSelection
          video.srcObject = nextStream
          await awaitVideoReady()
          await video.play()

          state.set({
            status: 'ready',
            error: null,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            streamVersion: state.get().streamVersion + 1,
            videoDeviceId: nextSelection.videoDeviceId ?? null,
            audioDeviceId: nextSelection.audioDeviceId ?? null,
          })
        }

        const api: CameraAPI & { state: typeof state } = {
          stream,
          video,
          config: {
            facingMode,
            width,
            height,
            frameRate,
            videoDeviceId,
            audioDeviceId,
            enableAudio,
          },
          state,
          stop: () => {
            stream.getTracks().forEach((t) => t.stop())
            video.pause()
            video.srcObject = null
          },
          pause: () => {
            video.pause()
          },
          resume: () => {
            video.play().catch((err) => {
              console.warn('[Camera] Failed to resume video:', err)
            })
          },
          setDevices: async (selection) => {
            try {
              await replaceStream(selection)
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : 'Failed to switch camera device'
              state.set({
                status: 'error',
                error: message,
                videoWidth: 0,
                videoHeight: 0,
                streamVersion: state.get().streamVersion,
                videoDeviceId: state.get().videoDeviceId,
                audioDeviceId: state.get().audioDeviceId,
              })
              throw err
            }
          },

          useVideoContainer: (
            containerRef: React.RefObject<HTMLDivElement | null>,
            options: { mirrored?: boolean } = {},
          ) => {
            useEffect(() => {
              const container = containerRef.current
              if (!container) return

              // Apply styles to video element
              video.style.position = 'absolute'
              video.style.top = '0'
              video.style.left = '0'
              video.style.width = '100%'
              video.style.height = '100%'
              video.style.objectFit = 'contain' // Show full video, maintain aspect ratio
              video.style.transform = options.mirrored ? 'scaleX(-1)' : 'none'

              // Check if video is already in this container
              if (!container.contains(video)) {
                container.appendChild(video)
              }

              return () => {
                if (container.contains(video)) {
                  container.removeChild(video)
                }
              }
            }, [containerRef, options.mirrored])
          },
        }

        return api
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to access camera'
        state.set({
          status: 'error',
          error: message,
          videoWidth: 0,
          videoHeight: 0,
          streamVersion: state.get().streamVersion,
          videoDeviceId: state.get().videoDeviceId,
          audioDeviceId: state.get().audioDeviceId,
        })
        throw error
      }
    },
    halt: (camera) => {
      camera.stop()
    },
  })

// Default camera resource with standard config
export const cameraResource = createCameraResource({
  facingMode: 'user',
  width: 1280,
  height: 720,
  frameRate: 30,
  enableAudio: false,
})

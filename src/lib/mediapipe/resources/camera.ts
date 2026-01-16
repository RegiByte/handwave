import { defineResource } from 'braided'
import { createAtom } from '../../state'

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
  setDevices: (selection: CameraDeviceSelection) => Promise<void>
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

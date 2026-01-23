import { defineResource } from 'braided'
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import type { VisionRuntimeAPI } from './vision'
import { createAtom } from '@handwave/system'

export type FaceLandmarkerConfig = {
  numFaces?: number
  minFaceDetectionConfidence?: number
  minFacePresenceConfidence?: number
  minTrackingConfidence?: number
  outputFaceBlendshapes?: boolean
  outputFacialTransformationMatrixes?: boolean
}

export type FaceLandmarkerState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

export type FaceLandmarkerAPI = {
  landmarker: FaceLandmarker
  state: ReturnType<typeof createAtom<FaceLandmarkerState>>
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
  ) => ReturnType<FaceLandmarker['detectForVideo']>
}

const FACE_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export const createFaceLandmarkerResource = (
  config: FaceLandmarkerConfig = {},
) =>
  defineResource({
    dependencies: ['vision'] as const,
    start: async ({ vision }: { vision: VisionRuntimeAPI }) => {
      const {
        numFaces = 1,
        minFaceDetectionConfidence = 0.5,
        minFacePresenceConfidence = 0.5,
        minTrackingConfidence = 0.5,
        outputFaceBlendshapes = true,
        outputFacialTransformationMatrixes = true,
      } = config

      const state = createAtom<FaceLandmarkerState>({
        status: 'idle',
        error: null,
      })

      state.set({ status: 'loading', error: null })

      try {
        const landmarker = await FaceLandmarker.createFromOptions(
          vision.fileset,
          {
            baseOptions: {
              modelAssetPath: FACE_MODEL_PATH,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces,
            minFaceDetectionConfidence,
            minFacePresenceConfidence,
            minTrackingConfidence,
            outputFaceBlendshapes,
            outputFacialTransformationMatrixes,
          },
        )

        state.set({ status: 'ready', error: null })

        const api: FaceLandmarkerAPI = {
          landmarker,
          state,
          detectForVideo: (video, timestamp) =>
            landmarker.detectForVideo(video, timestamp),
        }

        return api
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load face landmarker'
        state.set({ status: 'error', error: message })
        throw error
      }
    },
    halt: ({ landmarker }) => {
      landmarker.close()
    },
  })

// Default face landmarker resource
export const faceLandmarkerResource = createFaceLandmarkerResource()


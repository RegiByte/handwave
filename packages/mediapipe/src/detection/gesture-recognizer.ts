import { defineResource } from 'braided'
import { GestureRecognizer } from '@mediapipe/tasks-vision'
import type { VisionRuntimeAPI } from './vision'
import { createAtom } from '@handwave/system'
import { GestureRecognizerConfig } from '../vocabulary/detectionSchemas'

export type GestureRecognizerState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

export type GestureRecognizerAPI = {
  recognizer: GestureRecognizer
  state: ReturnType<typeof createAtom<GestureRecognizerState>>
  recognizeForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
  ) => ReturnType<GestureRecognizer['recognizeForVideo']>
}

const GESTURE_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

export const createGestureRecognizerResource = (
  config: GestureRecognizerConfig = {},
) =>
  defineResource({
    dependencies: ['vision'] as const,
    start: async ({ vision }: { vision: VisionRuntimeAPI }) => {
      const {
        numHands = 2,
        minHandDetectionConfidence = 0.5,
        minHandPresenceConfidence = 0.5,
        minTrackingConfidence = 0.5,
      } = config

      const state = createAtom<GestureRecognizerState>({
        status: 'idle',
        error: null,
      })

      state.set({ status: 'loading', error: null })

      try {
        const recognizer = await GestureRecognizer.createFromOptions(
          vision.fileset,
          {
            baseOptions: {
              modelAssetPath: GESTURE_MODEL_PATH,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands,
            minHandDetectionConfidence,
            minHandPresenceConfidence,
            minTrackingConfidence,
          },
        )

        state.set({ status: 'ready', error: null })

        const api: GestureRecognizerAPI = {
          recognizer,
          state,
          recognizeForVideo: (video, timestamp) =>
            recognizer.recognizeForVideo(video, timestamp),
        }

        return api
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load gesture recognizer'
        state.set({ status: 'error', error: message })
        throw error
      }
    },
    halt: ({ recognizer }) => {
      recognizer.close()
    },
  })

// Default gesture recognizer resource
export const gestureRecognizerResource = createGestureRecognizerResource()

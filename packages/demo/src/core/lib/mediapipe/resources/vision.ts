import { defineResource } from 'braided'
import { FilesetResolver } from '@mediapipe/tasks-vision'
import { createAtom } from '@handwave/system'

export type VisionRuntimeState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

export type VisionRuntimeAPI = {
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
  state: ReturnType<typeof createAtom<VisionRuntimeState>>
}

const WASM_CDN_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'

export const createVisionResource = (wasmPath: string = WASM_CDN_PATH) =>
  defineResource({
    dependencies: [],
    start: async () => {
      const state = createAtom<VisionRuntimeState>({
        status: 'idle',
        error: null,
      })

      state.set({ status: 'loading', error: null })

      try {
        const fileset = await FilesetResolver.forVisionTasks(wasmPath)

        state.set({ status: 'ready', error: null })

        const api: VisionRuntimeAPI = {
          fileset,
          state,
        }

        return api
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load vision WASM'
        state.set({ status: 'error', error: message })
        throw error
      }
    },
    halt: () => {
      // FilesetResolver doesn't need explicit cleanup
    },
  })

// Default vision resource
export const visionResource = createVisionResource()


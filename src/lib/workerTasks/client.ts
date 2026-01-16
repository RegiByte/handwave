/**
 * Worker Tasks Abstraction - Client Side
 *
 * Main thread client for worker communication.
 * Manages worker lifecycle, message passing, and subscriptions.
 *
 * Simplified version using only local state primitives (no emergent dependency).
 *
 * Dependencies:
 * - braided: Resource composition system
 * - ./workerTasks.core: Core types and utilities
 * - @/lib/state: Lightweight state management
 */

import { defineResource } from 'braided'
import type {
  ClientEvent,
  ClientStatus,
  InferInput,
  InferOutput,
  InferProgress,
  TaskRegistry,
  WorkerEvent,
  WorkerImportFn,
} from './core'
import { clientStatusKeywords, eventKeywords, generateTaskId } from './core'

import { createAtom, createSubscription } from '@/lib/state'

type ClientState = {
  status: ClientStatus
  messageQueue: Array<ClientEvent>
}

type ClientTaskSubscription<TTasks, TName extends keyof TTasks> = {
  taskId: string
  taskName: TName
  onProgress: (
    callback: (progress: InferProgress<TTasks[TName]>) => void,
  ) => ClientTaskSubscription<TTasks, TName>
  onComplete: (
    callback: (output: InferOutput<TTasks[TName]>) => void,
  ) => ClientTaskSubscription<TTasks, TName>
  onError: (
    callback: (error: string) => void,
  ) => ClientTaskSubscription<TTasks, TName>
  unsubscribe: () => void
}

/**
 * Create client resource for worker tasks
 *
 * Pure function approach - manages worker lifecycle and message passing
 */
export function createClientResource<TTasks extends TaskRegistry>(
  workerImport: WorkerImportFn,
  _tasks: TTasks,
) {
  return defineResource({
    dependencies: [],
    start: () => {
      type TaskName = keyof TTasks

      // Local state
      let worker: Worker | null = null
      const workerSubscriptions = createSubscription<WorkerEvent>()
      const clientState = createAtom<ClientState>({
        status: clientStatusKeywords.waitingForReady,
        messageQueue: [],
      })

      // Handle incoming worker messages
      const handleWorkerMessage = (event: MessageEvent<WorkerEvent>): void => {
        const workerEvent = event.data

        // Handle worker ready event
        if (workerEvent.type === eventKeywords.workerReady) {
          console.log('[Client] Worker is ready! Flushing queued messages...')
          clientState.update((state) => ({
            ...state,
            status: clientStatusKeywords.ready,
          }))

          // Flush message queue
          const state = clientState.get()
          if (worker && state.messageQueue.length > 0) {
            console.log(
              `[Client] Flushing ${state.messageQueue.length} queued messages`,
            )
            state.messageQueue.forEach((queuedEvent) => {
              const { transferables, ...eventWithoutTransferables } =
                queuedEvent
              if (transferables && transferables.length > 0) {
                worker!.postMessage(eventWithoutTransferables, transferables)
              } else {
                worker!.postMessage(eventWithoutTransferables)
              }
            })
            clientState.update((s) => ({
              ...s,
              messageQueue: [],
            }))
          }
        }

        // Notify all subscribers
        workerSubscriptions.notify(workerEvent)
      }

      // Initialize worker
      const init = async (): Promise<void> => {
        try {
          console.log('[Client] Initializing worker...')
          clientState.update((state) => ({
            ...state,
            status: clientStatusKeywords.initializing,
          }))

          const WorkerModule = await workerImport()
          worker = new WorkerModule.default()

          worker.onmessage = handleWorkerMessage
          worker.onerror = (error: ErrorEvent) => {
            console.error('[Client] Worker error:', error.message)
            clientState.update((state) => ({
              ...state,
              status: clientStatusKeywords.error,
            }))
          }

          clientState.update((state) => ({
            ...state,
            status: clientStatusKeywords.waitingForReady,
          }))
          console.log('[Client] ⏳ Worker created, waiting for ready signal...')
        } catch (error) {
          console.error('[Client] Failed to initialize worker:', error)
          clientState.update((state) => ({
            ...state,
            status: clientStatusKeywords.error,
          }))
        }
      }

      // Dispatch task to worker
      type TaskSubscription<TName extends TaskName> = ClientTaskSubscription<
        TTasks,
        TName
      >

      const dispatch = <TName extends TaskName>(
        taskName: TName,
        input: InferInput<TTasks[TName]>,
        transferables?: Array<Transferable>,
      ): TaskSubscription<TName> => {
        const taskId = generateTaskId()
        const event: ClientEvent = {
          type: eventKeywords.taskRequest,
          taskId,
          taskName: taskName as string,
          input,
          transferables,
        }

        const state = clientState.get()
        if (state.status === clientStatusKeywords.ready && worker) {
          const { transferables: xfer, ...eventWithoutTransferables } = event
          if (xfer && xfer.length > 0) {
            worker.postMessage(eventWithoutTransferables, xfer)
          } else {
            worker.postMessage(eventWithoutTransferables)
          }
        } else if (
          state.status === clientStatusKeywords.initializing ||
          state.status === clientStatusKeywords.waitingForReady
        ) {
          console.log(
            '[Client] Queueing task (worker not ready):',
            taskName,
            taskId,
          )
          clientState.update((s) => ({
            ...s,
            messageQueue: [...s.messageQueue, event],
          }))
        } else {
          console.error(
            '[Client] Cannot dispatch - worker status:',
            state.status,
          )
        }

        // Create subscription for this task
        const dispatchSubscription = createSubscription<void>()
        let terminalEventReceived = false
        const callbacksAtom = createAtom({
          pending: { complete: 0, error: 0 },
          fired: { complete: 0, error: 0 },
        })

        const maybeAutoCleanup = (
          callbacks: ReturnType<typeof callbacksAtom.get>,
        ) => {
          if (!terminalEventReceived) return

          const allCompleteFired =
            callbacks.pending.complete === 0 ||
            callbacks.fired.complete === callbacks.pending.complete

          const allErrorFired =
            callbacks.pending.error === 0 ||
            callbacks.fired.error === callbacks.pending.error

          if (allCompleteFired && allErrorFired) {
            subscription.unsubscribe()
          }
        }

        const subscription: TaskSubscription<TName> = {
          taskId,
          taskName,

          onProgress: (callback) => {
            const unsubscribe = workerSubscriptions.subscribe(
              (progressEvent) => {
                if (
                  progressEvent.type === eventKeywords.taskProgress &&
                  progressEvent.taskId === taskId
                ) {
                  callback(
                    progressEvent.progress as InferProgress<TTasks[TName]>,
                  )
                }
              },
            )
            dispatchSubscription.subscribe(unsubscribe)
            return subscription
          },

          onComplete: (callback) => {
            callbacksAtom.update((s) => ({
              ...s,
              pending: {
                ...s.pending,
                complete: s.pending.complete + 1,
              },
            }))

            const unsubscribe = workerSubscriptions.subscribe(
              (completedEvent) => {
                if (
                  completedEvent.type === eventKeywords.taskComplete &&
                  completedEvent.taskId === taskId
                ) {
                  terminalEventReceived = true
                  callback(completedEvent.output as InferOutput<TTasks[TName]>)

                  callbacksAtom.update((s) => ({
                    ...s,
                    fired: {
                      ...s.fired,
                      complete: s.fired.complete + 1,
                    },
                  }))

                  maybeAutoCleanup(callbacksAtom.get())
                }
              },
            )
            dispatchSubscription.subscribe(unsubscribe)
            return subscription
          },

          onError: (callback) => {
            callbacksAtom.update((s) => ({
              ...s,
              pending: {
                ...s.pending,
                error: s.pending.error + 1,
              },
            }))

            const unsubscribe = workerSubscriptions.subscribe((errorEvent) => {
              if (
                errorEvent.type === eventKeywords.taskError &&
                errorEvent.taskId === taskId
              ) {
                terminalEventReceived = true
                callback(errorEvent.error)

                callbacksAtom.update((s) => ({
                  ...s,
                  fired: {
                    ...s.fired,
                    error: s.fired.error + 1,
                  },
                }))

                maybeAutoCleanup(callbacksAtom.get())
              }
            })
            dispatchSubscription.subscribe(unsubscribe)
            return subscription
          },

          unsubscribe: () => {
            dispatchSubscription.clear()
          },
        }

        return subscription
      }

      // Terminate worker
      const terminate = (): void => {
        if (worker) {
          console.log('[Client] Terminating worker...')
          worker.terminate()
          worker = null
          clientState.update((state) => ({
            ...state,
            status: clientStatusKeywords.terminated,
            messageQueue: [],
          }))
          workerSubscriptions.clear()
          console.log('[Client] Worker terminated')
        }
      }

      // Start initialization
      init()

      // Public API
      const api = {
        dispatch,
        subscribe: workerSubscriptions.subscribe,
        getStatus: () => clientState.get().status,
        state: clientState,
        terminate,
      }

      return api
    },
    halt: (api) => {
      console.log('🛑 [Client Resource] Halting...')
      api.terminate()
    },
  })
}

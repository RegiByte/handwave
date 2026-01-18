/**
 * Worker Tasks Abstraction - Worker Side
 *
 * Worker thread system for task execution.
 * Receives task requests, executes them, and sends back results.
 *
 * Simplified version using only local state primitives (no emergent dependency).
 *
 * Dependencies:
 * - braided: Resource composition system
 * - ./workerTasks.core: Core types and utilities
 * - @/lib/state: Lightweight state management
 */

import { defineResource } from 'braided'
import type { StartedResource } from 'braided'
import type { ZodSafeParseSuccess } from 'zod'
import type { ClientEvent, TaskRegistry, WorkerEvent } from './core'
import { eventKeywords, hasProgress } from './core'
import { createSubscription } from '@/core/lib/state'

/**
 * Worker transport layer
 * Handles message passing between worker and main thread
 */
const workerTransportResource = defineResource({
  start: () => {
    const transportListeners = createSubscription<ClientEvent>()

    const handleMessage = (event: MessageEvent<ClientEvent>) => {
      const clientEvent = event.data
      transportListeners.notify(clientEvent)
    }

    const sendMessage = (event: WorkerEvent) => {
      self.postMessage(event)
    }

    const api = {
      notifyReady: () => {
        sendMessage({
          type: eventKeywords.workerReady,
          timestamp: Date.now(),
        })
      },
      addMessageListener: (listener: (event: ClientEvent) => void) => {
        return transportListeners.subscribe(listener)
      },
      sendMessage: (event: WorkerEvent) => {
        sendMessage(event)
      },
      setupWorkerListener: () => {
        self.addEventListener('message', handleMessage)
      },
      cleanupWorkerListener: () => {
        self.removeEventListener('message', handleMessage)
      },
      notifyError: (message: string, taskId: string, taskName: string) => {
        sendMessage({
          type: eventKeywords.taskError,
          taskId,
          taskName,
          error: message,
        })
      },
    }

    return api
  },
  halt: (api) => {
    api.cleanupWorkerListener()
  },
})
type WorkerTransport = StartedResource<typeof workerTransportResource>

/**
 * Execute a task and send results back to client
 * Pure function approach - no side effects except message sending
 */
const executeTask = async (
  taskId: string,
  taskName: string,
  input: unknown,
  tasks: TaskRegistry,
  sendToClient: (event: WorkerEvent) => void,
): Promise<void> => {
  const task = tasks[taskName]
  if (!task) {
    sendToClient({
      type: eventKeywords.taskError,
      taskId,
      taskName,
      error: `Unknown task: ${taskName}`,
    })
    return
  }

  try {
    // Create task context with optional progress reporting
    const taskContext = {
      reportProgress: hasProgress(task)
        ? async (progress: unknown) => {
            sendToClient({
              type: eventKeywords.taskProgress,
              taskId,
              taskName,
              progress,
            })
            return Promise.resolve()
          }
        : (undefined as never), // Type as never for tasks without progress
    }

    // Execute the task
    const result = await task.execute(input, taskContext)

    // Validate output if parseIO is enabled
    const outputResult = task.parseIO
      ? task.output.safeParse(result)
      : ({ success: true, data: result } as ZodSafeParseSuccess<typeof result>)

    if (!outputResult.success) {
      sendToClient({
        type: eventKeywords.taskError,
        taskId,
        taskName,
        error: `Invalid output: ${outputResult.error.message}`,
      })
      return
    }

    // Send success result
    sendToClient({
      type: eventKeywords.taskComplete,
      taskId,
      taskName,
      output: outputResult.data,
    })
  } catch (error) {
    // Send error result
    sendToClient({
      type: eventKeywords.taskError,
      taskId,
      taskName,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Handle incoming task request
 * Pure function - validates input and triggers execution
 */
const handleTaskRequest = (
  event: ClientEvent,
  tasks: TaskRegistry,
  sendToClient: (event: WorkerEvent) => void,
): void => {
  if (event.type !== eventKeywords.taskRequest) return

  const task = tasks[event.taskName]
  if (!task) {
    console.warn(`[Worker] Unknown task: ${event.taskName}`)
    sendToClient({
      type: eventKeywords.taskError,
      taskId: event.taskId,
      taskName: event.taskName,
      error: `Unknown task: ${event.taskName}`,
    })
    return
  }

  // Validate input if parseIO is enabled
  const inputResult = task.parseIO
    ? task.input.safeParse(event.input)
    : ({ success: true, data: event.input } as ZodSafeParseSuccess<
        typeof event.input
      >)

  if (!inputResult.success) {
    console.warn(
      `[Worker] Invalid input for task ${event.taskName}:`,
      inputResult.error,
    )
    sendToClient({
      type: eventKeywords.taskError,
      taskId: event.taskId,
      taskName: event.taskName,
      error: `Invalid input: ${inputResult.error.message}`,
    })
    return
  }

  // Execute task asynchronously
  executeTask(
    event.taskId,
    event.taskName,
    inputResult.data,
    tasks,
    sendToClient,
  )
}

/**
 * Create worker system configuration for a task registry
 *
 * This creates a Braided resource system for managing worker lifecycle
 */
export function createWorkerSystem<T extends TaskRegistry>(tasks: T) {
  const workerEventLoopResource = defineResource({
    dependencies: ['workerTransport'],
    start: ({ workerTransport }: { workerTransport: WorkerTransport }) => {
      console.log('[Worker] Starting task event loop...')

      // Simple message handler - no complex state management needed
      const handleMessage = (event: ClientEvent) => {
        handleTaskRequest(event, tasks, workerTransport.sendMessage)
      }

      return {
        dispatch: handleMessage,
      }
    },
    halt: () => {
      console.log('[Worker] Halting task event loop...')
    },
  })
  type WorkerLoop = StartedResource<typeof workerEventLoopResource>

  const messageListener = defineResource({
    dependencies: ['workerEventLoop', 'workerTransport'],
    start: ({
      workerEventLoop,
      workerTransport,
    }: {
      workerEventLoop: WorkerLoop
      workerTransport: WorkerTransport
    }) => {
      console.log('[Worker] Starting message listener...')

      const unsubscribe = workerTransport.addMessageListener(
        workerEventLoop.dispatch,
      )
      workerTransport.setupWorkerListener()

      return {
        cleanup: () => {
          unsubscribe()
        },
      }
    },
    halt: (listener) => {
      console.log('[Worker] Halting message listener...')
      listener.cleanup()
    },
  })

  return {
    workerTransport: workerTransportResource,
    workerEventLoop: workerEventLoopResource,
    messageListener,
  }
}

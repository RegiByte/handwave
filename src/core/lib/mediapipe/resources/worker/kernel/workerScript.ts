/**
 * Detection Worker Entry Point
 *
 * Worker thread entry for MediaPipe detection.
 * Uses braided system for resource management.
 *
 * Worker-driven architecture:
 *   - detection/initializeWorker - Initialize braided system and models
 *   - detection/startDetection - Start independent detection loop
 *   - detection/stopDetection - Stop detection loop
 *   - detection/attachCanvas - Attach OffscreenCanvas for frame input
 *   - detection/command - Send runtime commands (pause, resume, etc.)
 */

import { startSystem } from 'braided'
import { systemTasks } from './systemTasks'
import { createWorkerSystem } from '@/core/lib/workerTasks/worker'

console.log('[Detection Worker] 🚀 Worker script loaded and executing...')

try {
  // Create the worker system with system tasks only
  const detectionWorkerSystem = createWorkerSystem(systemTasks)

  console.log('[Detection Worker] Starting worker system...')

  startSystem(detectionWorkerSystem)
    .then(({ system, errors }) => {
      if (errors.size > 0) {
        console.error('❌ [Detection Worker] System started with errors:')
        errors.forEach((error, resourceId) => {
          console.error(`  - ${resourceId}:`, error)
        })

        system.workerTransport.notifyError(
          `System started with ${errors.size} error(s)`,
          'detectionWorkerSetup',
          'detectionWorkerSetup',
        )
        return
      }

      console.log('✅ [Detection Worker] Worker system ready')
      system.workerTransport.notifyReady()
    })
    .catch((error) => {
      console.error('❌ [Detection Worker] System failed to start:', error)
      console.error('❌ [Detection Worker] Error stack:', error?.stack)
      // Try to send error to main thread
      try {
        self.postMessage({
          type: 'worker/error',
          error: String(error),
          stack: error?.stack,
        })
      } catch (postError) {
        console.error('❌ [Detection Worker] Failed to post error:', postError)
      }
    })
} catch (error) {
  console.error('❌ [Detection Worker] Synchronous error during load:', error)
  try {
    self.postMessage({
      type: 'worker/error',
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  } catch (postError) {
    console.error('❌ [Detection Worker] Failed to post error:', postError)
  }
}

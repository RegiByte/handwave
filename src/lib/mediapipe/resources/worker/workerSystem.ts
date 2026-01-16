/**
 * Worker System Configuration
 *
 * Defines the complete braided system for the MediaPipe detection worker.
 * Resources are started in dependency order and halted in reverse order.
 *
 * Dependency Graph:
 *
 *   workerStore (no deps) - Worker-local state
 *       ↓
 *   workerVision ← workerStore - MediaPipe models
 *       ↓
 *   workerDetectors ← workerStore, workerVision - Detection logic
 *       ↓
 *   workerUpdateLoop ← workerStore, workerDetectors - Independent loop
 *
 * Philosophy: Worker owns its own braided system, independent of main thread.
 * Communication happens via message passing (commands/events/results).
 */

import type { StartedSystem } from 'braided'
import {  createWorkerStore } from './workerStore'
import type {WorkerStoreState} from './workerStore';
import { workerVision } from './workerVision'
import { workerDetectors } from './workerDetectors'
import { workerUpdateLoop } from './workerUpdateLoop'

/**
 * Create worker system configuration
 * Accepts optional initial state for configuration
 */
export const createWorkerSystemConfig = (
  initialState?: Partial<WorkerStoreState>,
) => {
  return {
    workerStore: createWorkerStore(initialState),
    workerVision,
    workerDetectors,
    workerUpdateLoop,
  }
}

/**
 * Type for the started worker system
 */
export type WorkerSystem = StartedSystem<
  ReturnType<typeof createWorkerSystemConfig>
>


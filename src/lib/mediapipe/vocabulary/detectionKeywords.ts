/**
 * Detection Worker Keywords
 *
 * Centralized string constants for detection worker tasks.
 * Worker-driven architecture only (no legacy mode).
 */

export const detectionKeywords = {
  tasks: {
    // System lifecycle
    initializeWorker: 'detection/initializeWorker',
    startDetection: 'detection/startDetection',
    stopDetection: 'detection/stopDetection',
    haltWorker: 'detection/haltWorker',

    // Frame input
    pushFrame: 'detection/pushFrame',

    // Commands
    command: 'detection/command',
  },

  commands: {
    start: 'start',
    stop: 'stop',
    pause: 'pause',
    resume: 'resume',
    setTargetFPS: 'setTargetFPS',
    setDetectionSettings: 'setDetectionSettings',
  },

  events: {
    initialized: 'initialized',
    started: 'started',
    stopped: 'stopped',
    paused: 'paused',
    resumed: 'resumed',
    frame: 'frame',
    error: 'error',
  },
} as const

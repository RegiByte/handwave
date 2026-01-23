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

    // SharedArrayBuffer
    attachSharedBuffer: 'detection/attachSharedBuffer',

    // Viewport sync
    updateViewport: 'detection/updateViewport',

    // Commands
    command: 'detection/command',

    // Spatial
    setGridResolution: 'detection/setGridResolution',
    
    // Display context sync
    updateDisplayContext: 'detection/updateDisplayContext',
  },

  commands: {
    start: 'start',
    stop: 'stop',
    pause: 'pause',
    resume: 'resume',
    setTargetFPS: 'setTargetFPS',
    setDetectionSettings: 'setDetectionSettings',
    setGridResolution: 'setGridResolution',
  },

  events: {
    initialized: 'initialized',
    started: 'started',
    stopped: 'stopped',
    paused: 'paused',
    resumed: 'resumed',
    frame: 'frame',
    error: 'error',
    spatialUpdate: 'spatialUpdate',
  },
} as const

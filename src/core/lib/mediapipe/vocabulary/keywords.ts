/**
 * MediaPipe System Keywords
 * 
 * Centralized string constants to prevent drift between types and implementation.
 * All command and event type strings are defined here.
 */

export const mediapipeKeywords = {
  commands: {
    // Lifecycle
    start: 'start',
    stop: 'stop',
    
    // Playback control
    pause: 'pause',
    resume: 'resume',
    togglePause: 'togglePause',
    
    // Display control
    toggleMirror: 'toggleMirror',
    setMirrored: 'setMirrored',
    
    // Device management
    setVideoDevice: 'setVideoDevice',
    setAudioDevice: 'setAudioDevice',
    
    // Debug toggles
    toggleDebugMode: 'toggleDebugMode',
    toggleGridOverlay: 'toggleGridOverlay',
    setGridResolution: 'setGridResolution',
    toggleHandLandmarkLabels: 'toggleHandLandmarkLabels',
    toggleFaceLandmarkLabels: 'toggleFaceLandmarkLabels',
    toggleBlendshapesDisplay: 'toggleBlendshapesDisplay',
    toggleHandCoordinates: 'toggleHandCoordinates',
    toggleVideoForeground: 'toggleVideoForeground',
    toggleParticles: 'toggleParticles',
  },
  events: {
    // Lifecycle
    initialized: 'initialized',
    started: 'started',
    stopped: 'stopped',
    workerReady: 'workerReady', // Emitted when detection worker is fully initialized
    
    // State changes
    paused: 'paused',
    resumed: 'resumed',
    mirrorToggled: 'mirrorToggled',
    
    // Device changes
    videoDeviceChanged: 'videoDeviceChanged',
    audioDeviceChanged: 'audioDeviceChanged',
    devicesEnumerated: 'devicesEnumerated',
    
    // Debug state changes
    debugModeToggled: 'debugModeToggled',
    gridOverlayToggled: 'gridOverlayToggled',
    gridResolutionChanged: 'gridResolutionChanged',
    videoForegroundToggled: 'videoForegroundToggled',
    particlesToggled: 'particlesToggled',
    spatialUpdate: 'spatialUpdate',
    
    // Errors
    error: 'error',
  },
} as const


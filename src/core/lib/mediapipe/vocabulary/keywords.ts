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
    toggleHandLandmarkLabels: 'toggleHandLandmarkLabels',
    toggleFaceLandmarkLabels: 'toggleFaceLandmarkLabels',
    toggleBlendshapesDisplay: 'toggleBlendshapesDisplay',
    toggleHandCoordinates: 'toggleHandCoordinates',
    toggleVideoForeground: 'toggleVideoForeground',
  },
  events: {
    // Lifecycle
    initialized: 'initialized',
    started: 'started',
    stopped: 'stopped',
    
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
    
    // Errors
    error: 'error',
  },
} as const


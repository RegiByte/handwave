/**
 * @handwave/rendering
 * 
 * Reusable 2D rendering utilities and debug visualization tasks for HandWave projects.
 */

// Debug tasks
export * from './tasks/debug/createGridOverlayTask'
export * from './tasks/debug/createMultiGridOverlayTask'
export * from './tasks/debug/createHandLandmarkLabelsTask'
export * from './tasks/debug/createFaceLandmarkLabelsTask'
export * from './tasks/debug/createHandCoordinatesTask'
export * from './tasks/debug/createBlendshapesDisplayTask'
export * from './tasks/debug/createFaceMeshIndicesTask'
export * from './tasks/debug/createHandCustomConnectionsTask'

// UI tasks
export * from './tasks/createFpsTask'
export * from './tasks/createPauseIndicatorTask'
export * from './tasks/createGestureLabelsTask'

// Landmark tasks
export * from './tasks/createHandLandmarksTask'
export * from './tasks/createPinchRingsTask'

// Intent-aware tasks
export * from './tasks/createGestureDurationTask'

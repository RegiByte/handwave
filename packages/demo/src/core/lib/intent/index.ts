/**
 * Intent Engine - Demo-Specific Exports
 *
 * Re-exports from @handwave/intent-engine plus demo-specific resources.
 *
 * Philosophy:
 * - Core library lives in @handwave/intent-engine
 * - Demo-specific resources (Braided wrappers) live here
 * - Testing utilities for fixtures and analysis
 */

// ============================================================================
// Core Library (Re-export from @handwave/intent-engine)
// ============================================================================

export * from '@handwave/intent-engine'

// ============================================================================
// Demo-Specific Resources (Braided Framework Bindings)
// ============================================================================

export { frameHistoryResource } from '../../../system/resources/frameHistoryResource'
export type { FrameHistoryAPI } from '../../../system/resources/frameHistoryResource'
export { recordingResource } from '../../../system/resources/recordingResource'
export type { RecordingResource } from '../../../system/resources/recordingResource'
export { intentEngineResource } from '../../../system/resources/intentEngineResource'
export type { IntentEngineAPI } from '../../../system/resources/intentEngineResource'

// ============================================================================
// Testing Utilities (Fixtures & Analysis)
// ============================================================================

export * from './testing'

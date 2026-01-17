/**
 * Detection SharedArrayBuffer Layout
 *
 * Zero-copy shared memory for MediaPipe detection results.
 * Double-buffered for lock-free reads between worker and main thread.
 *
 * Philosophy: Data flows through well-defined structures.
 * The buffer is just a flat array of numbers - meaning emerges from layout.
 *
 * Supports: 2 faces, 4 hands
 */

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of faces to track */
export const MAX_FACES = 2

/** Maximum number of hands to track */
export const MAX_HANDS = 4

/** Number of landmarks per face (MediaPipe Face Mesh) */
export const FACE_LANDMARKS_COUNT = 478

/** Number of landmarks per hand (MediaPipe Hands) */
export const HAND_LANDMARKS_COUNT = 21

/** Number of face blendshapes (ARKit compatible) */
export const BLENDSHAPES_COUNT = 52

/** Facial transformation matrix size (4x4) */
export const TRANSFORMATION_MATRIX_SIZE = 16

/** Components per landmark: x, y, z, visibility */
export const LANDMARK_COMPONENTS = 4

/** Components per world landmark: x, y, z (no visibility) */
export const WORLD_LANDMARK_COMPONENTS = 3

// ============================================================================
// Size Calculations (in bytes)
// ============================================================================

/** Size of metadata section */
const METADATA_SIZE = 16 // bufferIndex(4) + timestamp(8) + faceCount(1) + handCount(1) + padding(2)

/** Size of face landmarks: 478 landmarks × 4 components × 4 bytes */
const FACE_LANDMARKS_BYTES = FACE_LANDMARKS_COUNT * LANDMARK_COMPONENTS * 4

/** Size of blendshapes: 52 scores × 4 bytes */
const BLENDSHAPES_BYTES = BLENDSHAPES_COUNT * 4

/** Size of transformation matrix: 16 floats × 4 bytes */
const TRANSFORMATION_MATRIX_BYTES = TRANSFORMATION_MATRIX_SIZE * 4

/** Total size per face */
const FACE_DATA_BYTES = FACE_LANDMARKS_BYTES + BLENDSHAPES_BYTES + TRANSFORMATION_MATRIX_BYTES

/** Size of hand landmarks: 21 landmarks × 4 components × 4 bytes */
const HAND_LANDMARKS_BYTES = HAND_LANDMARKS_COUNT * LANDMARK_COMPONENTS * 4

/** Size of world landmarks: 21 landmarks × 3 components × 4 bytes */
const WORLD_LANDMARKS_BYTES = HAND_LANDMARKS_COUNT * WORLD_LANDMARK_COMPONENTS * 4

/** Size of hand metadata: handedness(1) + padding(3) + handednessScore(4) + gestureIndex(1) + padding(3) + gestureScore(4) */
const HAND_METADATA_BYTES = 16

/** Total size per hand */
const HAND_DATA_BYTES = HAND_LANDMARKS_BYTES + WORLD_LANDMARKS_BYTES + HAND_METADATA_BYTES

/** Total size of one buffer (metadata + all faces + all hands) */
const SINGLE_BUFFER_SIZE =
  METADATA_SIZE + FACE_DATA_BYTES * MAX_FACES + HAND_DATA_BYTES * MAX_HANDS

/** Total size with double buffering */
const DOUBLE_BUFFER_SIZE = SINGLE_BUFFER_SIZE * 2

// ============================================================================
// Buffer Layout Type
// ============================================================================

/**
 * Memory layout offsets for the detection buffer.
 * All offsets are in bytes from the start of the SharedArrayBuffer.
 */
export type DetectionBufferLayout = {
  /** Total size of the buffer in bytes */
  totalBytes: number

  /** Size of a single buffer (for double buffering) */
  singleBufferSize: number

  // --- Metadata offsets (relative to buffer start) ---

  /** Offset to active buffer index (Uint32, 1 element) */
  bufferIndexOffset: number

  // --- Buffer 0 offsets ---

  /** Offset to buffer 0 timestamp (Float64) */
  buffer0TimestampOffset: number

  /** Offset to buffer 0 face count (Uint8) */
  buffer0FaceCountOffset: number

  /** Offset to buffer 0 hand count (Uint8) */
  buffer0HandCountOffset: number

  /** Offset to buffer 0 face data start */
  buffer0FacesOffset: number

  /** Offset to buffer 0 hands data start */
  buffer0HandsOffset: number

  // --- Buffer 1 offsets ---

  /** Offset to buffer 1 timestamp (Float64) */
  buffer1TimestampOffset: number

  /** Offset to buffer 1 face count (Uint8) */
  buffer1FaceCountOffset: number

  /** Offset to buffer 1 hand count (Uint8) */
  buffer1HandCountOffset: number

  /** Offset to buffer 1 face data start */
  buffer1FacesOffset: number

  /** Offset to buffer 1 hands data start */
  buffer1HandsOffset: number

  // --- Per-entity sizes (for offset calculations) ---

  /** Bytes per face */
  faceDataBytes: number

  /** Bytes per hand */
  handDataBytes: number

  /** Bytes for face landmarks */
  faceLandmarksBytes: number

  /** Bytes for blendshapes */
  blendshapesBytes: number

  /** Bytes for transformation matrix */
  transformationMatrixBytes: number

  /** Bytes for hand landmarks */
  handLandmarksBytes: number

  /** Bytes for world landmarks */
  worldLandmarksBytes: number
}

// ============================================================================
// Layout Calculation
// ============================================================================

/**
 * Calculate the memory layout for the detection buffer.
 * This is a pure function - same input always gives same output.
 */
export function calculateDetectionBufferLayout(): DetectionBufferLayout {
  // Buffer index is at the very start (shared between both buffers)
  const bufferIndexOffset = 0

  // Buffer 0 starts after the buffer index (aligned to 8 bytes for Float64)
  const buffer0Start = 8

  // Buffer 0 metadata
  const buffer0TimestampOffset = buffer0Start
  const buffer0FaceCountOffset = buffer0Start + 8
  const buffer0HandCountOffset = buffer0Start + 9
  // Padding: bytes 10-15 (to align face data to 4 bytes)

  // Buffer 0 face data starts at offset 16 from buffer start
  const buffer0FacesOffset = buffer0Start + 16

  // Buffer 0 hands data starts after all faces
  const buffer0HandsOffset = buffer0FacesOffset + FACE_DATA_BYTES * MAX_FACES

  // Buffer 1 starts after buffer 0
  const buffer1Start = buffer0Start + SINGLE_BUFFER_SIZE

  // Buffer 1 metadata
  const buffer1TimestampOffset = buffer1Start
  const buffer1FaceCountOffset = buffer1Start + 8
  const buffer1HandCountOffset = buffer1Start + 9

  // Buffer 1 face data
  const buffer1FacesOffset = buffer1Start + 16

  // Buffer 1 hands data
  const buffer1HandsOffset = buffer1FacesOffset + FACE_DATA_BYTES * MAX_FACES

  // Total size: buffer index (8 bytes aligned) + 2 buffers
  const totalBytes = 8 + SINGLE_BUFFER_SIZE * 2

  return {
    totalBytes,
    singleBufferSize: SINGLE_BUFFER_SIZE,

    bufferIndexOffset,

    buffer0TimestampOffset,
    buffer0FaceCountOffset,
    buffer0HandCountOffset,
    buffer0FacesOffset,
    buffer0HandsOffset,

    buffer1TimestampOffset,
    buffer1FaceCountOffset,
    buffer1HandCountOffset,
    buffer1FacesOffset,
    buffer1HandsOffset,

    faceDataBytes: FACE_DATA_BYTES,
    handDataBytes: HAND_DATA_BYTES,
    faceLandmarksBytes: FACE_LANDMARKS_BYTES,
    blendshapesBytes: BLENDSHAPES_BYTES,
    transformationMatrixBytes: TRANSFORMATION_MATRIX_BYTES,
    handLandmarksBytes: HAND_LANDMARKS_BYTES,
    worldLandmarksBytes: WORLD_LANDMARKS_BYTES,
  }
}

// ============================================================================
// Buffer Views Type
// ============================================================================

/**
 * Typed array views into the SharedArrayBuffer.
 * These provide type-safe access to the raw memory.
 */
export type DetectionBufferViews = {
  /** Raw SharedArrayBuffer reference */
  buffer: SharedArrayBuffer

  /** Layout information */
  layout: DetectionBufferLayout

  /** Buffer index view (Uint32) - which buffer is active */
  bufferIndex: Uint32Array

  /** DataView for flexible access */
  dataView: DataView

  // --- Buffer 0 views ---

  /** Buffer 0 face landmarks: [face0, face1] each Float32Array of 478×4 */
  buffer0FaceLandmarks: Array<Float32Array>

  /** Buffer 0 blendshapes: [face0, face1] each Float32Array of 52 */
  buffer0Blendshapes: Array<Float32Array>

  /** Buffer 0 transformation matrices: [face0, face1] each Float32Array of 16 */
  buffer0TransformationMatrices: Array<Float32Array>

  /** Buffer 0 hand landmarks: [hand0, hand1, hand2, hand3] each Float32Array of 21×4 */
  buffer0HandLandmarks: Array<Float32Array>

  /** Buffer 0 world landmarks: [hand0, hand1, hand2, hand3] each Float32Array of 21×3 */
  buffer0WorldLandmarks: Array<Float32Array>

  /** Buffer 0 hand metadata view */
  buffer0HandMetadata: Array<Uint8Array>

  /** Buffer 0 hand scores (handedness + gesture) */
  buffer0HandScores: Array<Float32Array>

  // --- Buffer 1 views ---

  /** Buffer 1 face landmarks */
  buffer1FaceLandmarks: Array<Float32Array>

  /** Buffer 1 blendshapes */
  buffer1Blendshapes: Array<Float32Array>

  /** Buffer 1 transformation matrices */
  buffer1TransformationMatrices: Array<Float32Array>

  /** Buffer 1 hand landmarks */
  buffer1HandLandmarks: Array<Float32Array>

  /** Buffer 1 world landmarks */
  buffer1WorldLandmarks: Array<Float32Array>

  /** Buffer 1 hand metadata view */
  buffer1HandMetadata: Array<Uint8Array>

  /** Buffer 1 hand scores */
  buffer1HandScores: Array<Float32Array>
}

// ============================================================================
// Buffer Creation
// ============================================================================

/**
 * Create a SharedArrayBuffer with the detection layout.
 * Returns both the buffer and its layout for reference.
 */
export function createDetectionSharedBuffer(): {
  buffer: SharedArrayBuffer
  layout: DetectionBufferLayout
} {
  const layout = calculateDetectionBufferLayout()
  const buffer = new SharedArrayBuffer(layout.totalBytes)

  // Initialize buffer index to 0
  const indexView = new Uint32Array(buffer, 0, 1)
  indexView[0] = 0

  return { buffer, layout }
}

/**
 * Create typed array views for accessing the shared buffer.
 * Views are lightweight - they don't copy data.
 */
export function createDetectionBufferViews(
  buffer: SharedArrayBuffer,
  layout: DetectionBufferLayout
): DetectionBufferViews {
  const bufferIndex = new Uint32Array(buffer, layout.bufferIndexOffset, 1)
  const dataView = new DataView(buffer)

  // Helper to create face views for a buffer
  const createFaceViews = (facesOffset: number) => {
    const faceLandmarks: Array<Float32Array> = []
    const blendshapes: Array<Float32Array> = []
    const transformationMatrices: Array<Float32Array> = []

    for (let i = 0; i < MAX_FACES; i++) {
      const faceStart = facesOffset + i * layout.faceDataBytes

      faceLandmarks.push(
        new Float32Array(
          buffer,
          faceStart,
          FACE_LANDMARKS_COUNT * LANDMARK_COMPONENTS
        )
      )

      blendshapes.push(
        new Float32Array(
          buffer,
          faceStart + layout.faceLandmarksBytes,
          BLENDSHAPES_COUNT
        )
      )

      transformationMatrices.push(
        new Float32Array(
          buffer,
          faceStart + layout.faceLandmarksBytes + layout.blendshapesBytes,
          TRANSFORMATION_MATRIX_SIZE
        )
      )
    }

    return { faceLandmarks, blendshapes, transformationMatrices }
  }

  // Helper to create hand views for a buffer
  const createHandViews = (handsOffset: number) => {
    const handLandmarks: Array<Float32Array> = []
    const worldLandmarks: Array<Float32Array> = []
    const handMetadata: Array<Uint8Array> = []
    const handScores: Array<Float32Array> = []

    for (let i = 0; i < MAX_HANDS; i++) {
      const handStart = handsOffset + i * layout.handDataBytes

      handLandmarks.push(
        new Float32Array(
          buffer,
          handStart,
          HAND_LANDMARKS_COUNT * LANDMARK_COMPONENTS
        )
      )

      worldLandmarks.push(
        new Float32Array(
          buffer,
          handStart + layout.handLandmarksBytes,
          HAND_LANDMARKS_COUNT * WORLD_LANDMARK_COMPONENTS
        )
      )

      // Hand metadata: handedness(1) + padding(3) + handednessScore(4) + gestureIndex(1) + padding(3) + gestureScore(4)
      const metadataOffset =
        handStart + layout.handLandmarksBytes + layout.worldLandmarksBytes

      handMetadata.push(new Uint8Array(buffer, metadataOffset, 16))

      // Scores are at offset 4 (handednessScore) and 12 (gestureScore)
      handScores.push(new Float32Array(buffer, metadataOffset + 4, 1))
    }

    return { handLandmarks, worldLandmarks, handMetadata, handScores }
  }

  // Create views for buffer 0
  const buffer0Faces = createFaceViews(layout.buffer0FacesOffset)
  const buffer0Hands = createHandViews(layout.buffer0HandsOffset)

  // Create views for buffer 1
  const buffer1Faces = createFaceViews(layout.buffer1FacesOffset)
  const buffer1Hands = createHandViews(layout.buffer1HandsOffset)

  return {
    buffer,
    layout,
    bufferIndex,
    dataView,

    buffer0FaceLandmarks: buffer0Faces.faceLandmarks,
    buffer0Blendshapes: buffer0Faces.blendshapes,
    buffer0TransformationMatrices: buffer0Faces.transformationMatrices,
    buffer0HandLandmarks: buffer0Hands.handLandmarks,
    buffer0WorldLandmarks: buffer0Hands.worldLandmarks,
    buffer0HandMetadata: buffer0Hands.handMetadata,
    buffer0HandScores: buffer0Hands.handScores,

    buffer1FaceLandmarks: buffer1Faces.faceLandmarks,
    buffer1Blendshapes: buffer1Faces.blendshapes,
    buffer1TransformationMatrices: buffer1Faces.transformationMatrices,
    buffer1HandLandmarks: buffer1Hands.handLandmarks,
    buffer1WorldLandmarks: buffer1Hands.worldLandmarks,
    buffer1HandMetadata: buffer1Hands.handMetadata,
    buffer1HandScores: buffer1Hands.handScores,
  }
}

// ============================================================================
// Buffer Index Operations (Atomic)
// ============================================================================

/**
 * Get the currently active buffer index (0 or 1).
 * Uses Atomics for thread-safe read.
 */
export function getActiveBufferIndex(views: DetectionBufferViews): 0 | 1 {
  return Atomics.load(views.bufferIndex, 0) as 0 | 1
}

/**
 * Get the currently inactive buffer index (for writing).
 */
export function getInactiveBufferIndex(views: DetectionBufferViews): 0 | 1 {
  return getActiveBufferIndex(views) === 0 ? 1 : 0
}

/**
 * Swap the active buffer (worker calls this after writing).
 * Uses Atomics for thread-safe write.
 */
export function swapDetectionBuffers(views: DetectionBufferViews): void {
  const current = getActiveBufferIndex(views)
  const next = current === 0 ? 1 : 0
  Atomics.store(views.bufferIndex, 0, next)
}

// ============================================================================
// Metadata Access
// ============================================================================

/**
 * Get timestamp from a buffer.
 */
export function getBufferTimestamp(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1
): number {
  const offset =
    bufferIdx === 0
      ? views.layout.buffer0TimestampOffset
      : views.layout.buffer1TimestampOffset
  return views.dataView.getFloat64(offset, true) // little-endian
}

/**
 * Set timestamp in a buffer.
 */
export function setBufferTimestamp(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1,
  timestamp: number
): void {
  const offset =
    bufferIdx === 0
      ? views.layout.buffer0TimestampOffset
      : views.layout.buffer1TimestampOffset
  views.dataView.setFloat64(offset, timestamp, true)
}

/**
 * Get face count from a buffer.
 */
export function getBufferFaceCount(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1
): number {
  const offset =
    bufferIdx === 0
      ? views.layout.buffer0FaceCountOffset
      : views.layout.buffer1FaceCountOffset
  return views.dataView.getUint8(offset)
}

/**
 * Set face count in a buffer.
 */
export function setBufferFaceCount(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1,
  count: number
): void {
  const offset =
    bufferIdx === 0
      ? views.layout.buffer0FaceCountOffset
      : views.layout.buffer1FaceCountOffset
  views.dataView.setUint8(offset, Math.min(count, MAX_FACES))
}

/**
 * Get hand count from a buffer.
 */
export function getBufferHandCount(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1
): number {
  const offset =
    bufferIdx === 0
      ? views.layout.buffer0HandCountOffset
      : views.layout.buffer1HandCountOffset
  return views.dataView.getUint8(offset)
}

/**
 * Set hand count in a buffer.
 */
export function setBufferHandCount(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1,
  count: number
): void {
  const offset =
    bufferIdx === 0
      ? views.layout.buffer0HandCountOffset
      : views.layout.buffer1HandCountOffset
  views.dataView.setUint8(offset, Math.min(count, MAX_HANDS))
}

// ============================================================================
// View Accessors (Get views for active/inactive buffer)
// ============================================================================

/**
 * Get face landmark views for a specific buffer.
 */
export function getFaceLandmarkViews(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1
): Array<Float32Array> {
  return bufferIdx === 0
    ? views.buffer0FaceLandmarks
    : views.buffer1FaceLandmarks
}

/**
 * Get blendshape views for a specific buffer.
 */
export function getBlendshapeViews(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1
): Array<Float32Array> {
  return bufferIdx === 0 ? views.buffer0Blendshapes : views.buffer1Blendshapes
}

/**
 * Get transformation matrix views for a specific buffer.
 */
export function getTransformationMatrixViews(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1
): Array<Float32Array> {
  return bufferIdx === 0
    ? views.buffer0TransformationMatrices
    : views.buffer1TransformationMatrices
}

/**
 * Get hand landmark views for a specific buffer.
 */
export function getHandLandmarkViews(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1
): Array<Float32Array> {
  return bufferIdx === 0
    ? views.buffer0HandLandmarks
    : views.buffer1HandLandmarks
}

/**
 * Get world landmark views for a specific buffer.
 */
export function getWorldLandmarkViews(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1
): Array<Float32Array> {
  return bufferIdx === 0
    ? views.buffer0WorldLandmarks
    : views.buffer1WorldLandmarks
}

/**
 * Get hand metadata views for a specific buffer.
 */
export function getHandMetadataViews(
  views: DetectionBufferViews,
  bufferIdx: 0 | 1
): Array<Uint8Array> {
  return bufferIdx === 0
    ? views.buffer0HandMetadata
    : views.buffer1HandMetadata
}

// ============================================================================
// SharedArrayBuffer Support Check
// ============================================================================

/**
 * Check if SharedArrayBuffer is available.
 * Requires COOP/COEP headers to be set.
 */
export function isSharedArrayBufferSupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}

/**
 * Get detailed SharedArrayBuffer support status.
 */
export function getSharedArrayBufferStatus(): {
  supported: boolean
  reason?: string
  crossOriginIsolated: boolean
} {
  const isCrossOriginIsolated =
    typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated

  if (typeof SharedArrayBuffer === 'undefined') {
    return {
      supported: false,
      reason: 'SharedArrayBuffer is not defined',
      crossOriginIsolated: isCrossOriginIsolated,
    }
  }

  if (!isCrossOriginIsolated) {
    return {
      supported: false,
      reason: 'crossOriginIsolated is false - needs COOP/COEP headers',
      crossOriginIsolated: isCrossOriginIsolated,
    }
  }

  return {
    supported: true,
    crossOriginIsolated: isCrossOriginIsolated,
  }
}


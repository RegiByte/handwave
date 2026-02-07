/**
 * World Resource
 *
 * System-layer world state management for Three.js entities.
 * Owns all 3D objects, handles intent subscriptions, manages interaction state.
 *
 * Philosophy:
 * - World owns the simulation, React only renders
 * - All interaction logic lives here, not in components
 * - Pure event-driven architecture
 * - Entities are discriminated unions for extensibility
 */

import { defineResource } from 'braided'
import type { Camera } from 'three'
import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import type { IntentEngineAPI } from './intentEngineResource'
import type { FrameHistoryResource } from './frameHistoryResource'
import { getPinchCenter } from '@/lib/coordinates'
import type { ViewportConfig } from '@/lib/coordinates'
import { grabIntent, resizeIntent } from '@/intents/core'

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Box entity - grabbable and resizable 3D box
 */
export interface BoxEntity {
  type: 'box'
  id: string
  mesh: Mesh
  basePosition: Vector3 // Original position (for reset)
  scale: number // Current scale
  
  // Interaction state
  grabbedBy: {
    handIndex: number
    handedness: string
    offset: Vector3 // Offset from pinch center to box center
  } | null
  
  resizedBy: {
    handIndex1: number
    handIndex2: number
    baselineDistance: number // Initial distance between hands
    originalScale: number // Scale when resize started
    lockedPosition: Vector3 // Position locked during resize
  } | null
}

/**
 * World entity - discriminated union for extensibility
 */
export type WorldEntity = BoxEntity

// ============================================================================
// World State
// ============================================================================

export interface WorldState {
  entities: Map<string, WorldEntity>
  
  // Viewport/camera state (needed for coordinate transforms)
  viewport: ViewportConfig | null
  camera: Camera | null
  mirrored: boolean
}

// ============================================================================
// Constants
// ============================================================================

const PROXIMITY_THRESHOLD = 1.5 // Distance threshold for grab detection
const MIN_SCALE = 0.5
const MAX_SCALE = 2.5
const SCALE_DAMPING = 0.5

// ============================================================================
// World Resource
// ============================================================================

export const worldResource = defineResource({
  dependencies: ['intentEngine', 'frameHistory'],
  
  start: ({ 
    intentEngine, 
    frameHistory 
  }: { 
    intentEngine: IntentEngineAPI
    frameHistory: FrameHistoryResource 
  }) => {
    
    // Initialize world state
    const state: WorldState = {
      entities: new Map(),
      viewport: null,
      camera: null,
      mirrored: true,
    }

    /**
     * Create a box entity
     */
    function createBox(
      id: string, 
      position: [number, number, number], 
      color: string
    ): BoxEntity {
      const geometry = new BoxGeometry(1, 1, 1)
      const material = new MeshStandardMaterial({ 
        color,
        metalness: 0.1,
        roughness: 0.7,
      })
      const mesh = new Mesh(geometry, material)
      mesh.position.set(...position)
      
      const entity: BoxEntity = {
        type: 'box',
        id,
        mesh,
        basePosition: new Vector3(...position),
        scale: 1.0,
        grabbedBy: null,
        resizedBy: null,
      }
      
      state.entities.set(id, entity)
      return entity
    }
    
    /**
     * Get entity by ID
     */
    function getEntity(id: string): WorldEntity | undefined {
      return state.entities.get(id)
    }
    
    /**
     * Get all entities of a specific type
     */
    function getEntitiesByType<T extends WorldEntity['type']>(
      type: T
    ): Array<Extract<WorldEntity, { type: T }>> {
      const entities: Array<Extract<WorldEntity, { type: T }>> = []
      
      for (const entity of state.entities.values()) {
        if (entity.type === type) {
          entities.push(entity as Extract<WorldEntity, { type: T }>)
        }
      }
      
      return entities
    }
    
    // ========================================================================
    // Helper Functions
    // ========================================================================
    
    /**
     * Get current detection frame
     */
    function getCurrentFrame() {
      const latestSnapshot = frameHistory.getLatestFrame()
      return latestSnapshot?.detectionFrame || null
    }
    
    /**
     * Find nearest box to a world position
     */
    function findNearestBox(
      worldPos: Vector3,
      maxDistance: number = PROXIMITY_THRESHOLD
    ): BoxEntity | null {
      let nearestBox: BoxEntity | null = null
      let nearestDistance = Infinity
      
      const boxes = getEntitiesByType('box')
      
      for (const box of boxes) {
        const distanceToCenter = worldPos.distanceTo(box.mesh.position)
        const boxRadius = 0.5 * box.scale
        const distanceToSurface = Math.max(0, distanceToCenter - boxRadius)
        
        if (distanceToSurface < nearestDistance && distanceToSurface < maxDistance) {
          nearestDistance = distanceToSurface
          nearestBox = box
        }
      }
      
      return nearestBox
    }
    
    /**
     * Get pinch center for a hand in world space
     */
    function getHandPinchCenter(handIndex: number): Vector3 | null {
      const frame = getCurrentFrame()
      if (!frame || !state.viewport || !state.camera) return null
      
      const hand = frame.detectors.hand?.find(h => h.handIndex === handIndex)
      if (!hand || !hand.landmarks || hand.landmarks.length < 21) return null
      
      return getPinchCenter(hand, state.viewport, state.camera, state.mirrored, 10)
    }
    
    
    // ========================================================================
    // Intent Handlers
    // ========================================================================
    
    /**
     * Handle grab intent start
     */
    function handleGrabStart(event: any) {
      console.log('[World] 🎯 Grab start - hand:', event.handIndex)
      const pinchCenter = getHandPinchCenter(event.handIndex)
      if (!pinchCenter) return
      
      // Find nearest box
      const box = findNearestBox(pinchCenter)
      if (!box) return
      
      // Don't grab if already grabbed or being resized
      if (box.grabbedBy || box.resizedBy) return
      
      // Calculate offset from pinch center to box center
      const offset = box.mesh.position.clone().sub(pinchCenter)
      
      // Grab the box
      box.grabbedBy = {
        handIndex: event.handIndex,
        handedness: event.hand,
        offset,
      }
      console.log('[World] ✅ Grabbed:', box.id)
    }
    
    /**
     * Handle grab intent end
     */
    function handleGrabEnd(event: any) {
      console.log('[World] 🎯 Grab end - hand:', event.handIndex)
      // Find box grabbed by this hand
      const boxes = getEntitiesByType('box')
      
      for (const box of boxes) {
        if (box.grabbedBy && box.grabbedBy.handIndex === event.handIndex) {
          // Update base position before releasing
          box.basePosition.copy(box.mesh.position)
          box.grabbedBy = null
          console.log('[World] ✅ Released:', box.id)
        }
      }
    }
    
    /**
     * Handle resize intent start
     */
    function handleResizeStart(event: any) {
      console.log('[World] 🔄 Resize start - hand:', event.handIndex)
      const frame = getCurrentFrame()
      if (!frame || !state.viewport || !state.camera) {
        console.log('[World] ❌ No frame/viewport/camera')
        return
      }
      
      const hands = frame.detectors.hand || []
      console.log('[World] Hands detected:', hands.length)
      if (hands.length < 2) {
        console.log('[World] ❌ Need 2 hands for resize')
        return
      }
      
      // Find the two hands involved
      const hand1 = hands.find(h => h.handIndex === event.handIndex)
      const hand2 = hands.find(h => h.handIndex !== event.handIndex)
      
      if (!hand1 || !hand2) return
      if (!hand1.landmarks || hand1.landmarks.length < 21) return
      if (!hand2.landmarks || hand2.landmarks.length < 21) return
      
      // Calculate pinch centers
      const pinchCenter1 = getPinchCenter(hand1, state.viewport, state.camera, state.mirrored, 10)
      const pinchCenter2 = getPinchCenter(hand2, state.viewport, state.camera, state.mirrored, 10)
      
      // Calculate center point between hands
      const centerPoint = new Vector3()
        .addVectors(pinchCenter1, pinchCenter2)
        .multiplyScalar(0.5)
      
      // Find nearest box to center point
      const box = findNearestBox(centerPoint)
      if (!box) {
        console.log('[World] ❌ No box found near center point')
        return
      }
      console.log('[World] ✅ Found box for resize:', box.id)
      
      // Don't resize if already grabbed or being resized
      if (box.grabbedBy || box.resizedBy) return
      
      // Calculate baseline distance between hands
      const baselineDistance = pinchCenter1.distanceTo(pinchCenter2)
      
      // Start resize
      box.resizedBy = {
        handIndex1: hand1.handIndex,
        handIndex2: hand2.handIndex,
        baselineDistance,
        originalScale: box.scale,
        lockedPosition: box.mesh.position.clone(),
      }
    }
    
    /**
     * Handle resize intent end
     */
    function handleResizeEnd(event: any) {
      // Find box being resized by this hand
      const boxes = getEntitiesByType('box')
      
      for (const box of boxes) {
        if (box.resizedBy) {
          const { handIndex1, handIndex2 } = box.resizedBy
          
          if (handIndex1 === event.handIndex || handIndex2 === event.handIndex) {
            // Finalize resize
            box.resizedBy = null
          }
        }
      }
    }
    
    // ========================================================================
    // Update Loop
    // ========================================================================
    
    /**
     * Update world state (called every frame)
     */
    function update(_delta: number) {
      const frame = getCurrentFrame()
      if (!frame || !state.viewport || !state.camera) return
      
      const boxes = getEntitiesByType('box')
      
      for (const box of boxes) {
        // Handle resize state
        if (box.resizedBy) {
          const { handIndex1, handIndex2, baselineDistance, originalScale, lockedPosition } = box.resizedBy
          
          const pinchCenter1 = getHandPinchCenter(handIndex1)
          const pinchCenter2 = getHandPinchCenter(handIndex2)
          
          if (pinchCenter1 && pinchCenter2) {
            // Calculate current distance between hands
            const currentDistance = pinchCenter1.distanceTo(pinchCenter2)
            
            // Calculate scale factor with damping
            const rawScaleFactor = currentDistance / baselineDistance
            const scaleFactor = 1 + (rawScaleFactor - 1) * SCALE_DAMPING
            
            // Apply scale with limits
            const newScale = Math.max(
              MIN_SCALE,
              Math.min(MAX_SCALE, originalScale * scaleFactor)
            )
            
            box.scale = newScale
            box.mesh.scale.setScalar(newScale)
            
            // Lock position during resize
            box.mesh.position.copy(lockedPosition)
          }
          
          continue // Skip other updates while resizing
        }
        
        // Handle grab state
        if (box.grabbedBy) {
          const { handIndex, offset } = box.grabbedBy
          const pinchCenter = getHandPinchCenter(handIndex)
          
          if (pinchCenter) {
            // Follow pinch center with offset
            box.mesh.position.copy(pinchCenter).add(offset)
          }
          
          continue // Skip rotation while grabbed
        }
        
        // Idle rotation (when not grabbed or resizing)
        box.mesh.rotation.x += 0.01
        box.mesh.rotation.y += 0.005
      }
    }
    
    // ========================================================================
    // Intent Subscriptions
    // ========================================================================
    
    const unsubscribeGrabStart = intentEngine.subscribe(
      grabIntent.events.start,
      handleGrabStart
    )
    
    const unsubscribeGrabEnd = intentEngine.subscribe(
      grabIntent.events.end,
      handleGrabEnd
    )
    
    const unsubscribeResizeStart = intentEngine.subscribe(
      resizeIntent.events.start,
      handleResizeStart
    )
    
    const unsubscribeResizeEnd = intentEngine.subscribe(
      resizeIntent.events.end,
      handleResizeEnd
    )
    
    // ========================================================================
    // Public API
    // ========================================================================
    
    return {
      // Entity management
      createBox,
      getEntity,
      getEntitiesByType,
      
      // State access
      getState: () => state,
      getAllEntities: () => Array.from(state.entities.values()),
      
      // Configuration
      setViewport: (viewport: ViewportConfig) => {
        state.viewport = viewport
      },
      
      setCamera: (camera: Camera) => {
        state.camera = camera
      },
      
      setMirrored: (mirrored: boolean) => {
        state.mirrored = mirrored
      },
      
      // Update loop
      update,
      
      // Cleanup
      cleanup: () => {
        unsubscribeGrabStart()
        unsubscribeGrabEnd()
        unsubscribeResizeStart()
        unsubscribeResizeEnd()
        
        // Dispose Three.js resources
        for (const entity of state.entities.values()) {
          if (entity.type === 'box') {
            entity.mesh.geometry.dispose()
            if (entity.mesh.material instanceof MeshStandardMaterial) {
              entity.mesh.material.dispose()
            }
          }
        }
        
        state.entities.clear()
      },
    }
  },
  
  halt: (api) => {
    api.cleanup()
  },
})

export type WorldAPI = ReturnType<typeof worldResource.start>

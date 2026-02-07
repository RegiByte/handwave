# World Resource Architecture Migration

**Date:** 2026-01-29  
**Status:** ✅ Complete

## Overview

Successfully migrated the Three.js demo from React-managed state to a clean system-layer architecture using the World resource pattern.

## What Changed

### Before: React-Managed State (❌ "Too Reacty")

```
MainView.tsx (764 lines)
├── useState for grab state
├── useState for resize state  
├── useRef for box positions
├── useRef for box scales
├── useEffect for grab intent subscriptions
├── useEffect for resize intent subscriptions
└── GrabbableBox components with useFrame logic
    ├── Proximity detection
    ├── Grab following
    ├── Resize scaling
    └── Rotation animation
```

**Problems:**
- Interaction logic scattered across React components
- State management coupled to rendering
- Multiple `useEffect` hooks for intent subscriptions
- Component-local `useFrame` loops (one per box)
- No clear separation between simulation and rendering

### After: World Resource Architecture (✅ Clean System Layer)

```
worldResource.ts (System Layer)
├── BoxEntity type (owns Three.js mesh)
├── World state (entities, viewport, camera)
├── Intent subscriptions (grab, resize)
├── Entity management (create, find, update)
└── Single update() method

MainView.tsx (Simplified)
├── Initialize world with boxes
├── Configure world (viewport, camera, mirrored)
├── WorldUpdater component (single useFrame)
└── WorldEntities component (renders with <primitive />)
```

**Benefits:**
- All interaction logic in system layer
- React only renders externally-owned meshes
- Single `useFrame` for entire world
- Clean separation: World owns simulation, React projects it
- Extensible entity system with discriminated unions

## Architecture

### Entity System

```typescript
// Discriminated union for extensibility
export type WorldEntity = BoxEntity

export interface BoxEntity {
  type: 'box'
  id: string
  mesh: Mesh  // Three.js object owned by World
  basePosition: Vector3
  scale: number
  grabbedBy: { handIndex, handedness, offset } | null
  resizedBy: { handIndex1, handIndex2, baselineDistance, originalScale, lockedPosition } | null
}
```

### World Resource API

```typescript
{
  // Entity management
  createBox(id, position, color): BoxEntity
  getEntity(id): WorldEntity | undefined
  getEntitiesByType<T>(type): Array<T>
  
  // State access
  getState(): WorldState
  getAllEntities(): Array<WorldEntity>
  
  // Configuration
  setViewport(viewport): void
  setCamera(camera): void
  setMirrored(mirrored): void
  
  // Update loop
  update(delta): void
  
  // Cleanup
  cleanup(): void
}
```

### React Integration

```tsx
// Initialize world with entities
useEffect(() => {
  world.createBox('box-1', [-2, 0, 0], 'orange')
  world.createBox('box-2', [2, 0, 0], 'hotpink')
}, [world])

// Single update loop
function WorldUpdater({ world }) {
  useFrame((_, delta) => {
    world.update(delta)
  })
  return null
}

// Render externally-owned meshes
function WorldEntities({ world }) {
  const entities = world.getEntitiesByType('box')
  return (
    <>
      {entities.map(entity => (
        <primitive key={entity.id} object={entity.mesh} />
      ))}
    </>
  )
}
```

## File Changes

### New Files
- `apps/demo-threejs/src/system/resources/worldResource.ts` - World resource implementation
- `apps/demo-threejs/src/components/MainView.OLD.tsx` - Archived old implementation
- `apps/demo-threejs/src/components/GrabbableBox.OLD.tsx` - Archived old component

### Modified Files
- `apps/demo-threejs/src/system/system.ts` - Added world resource to system config
- `apps/demo-threejs/src/components/MainView.tsx` - Simplified to use World resource

### Removed Complexity
- ~400 lines of React state management code
- Multiple `useEffect` intent subscriptions
- Component-local `useFrame` loops
- Props drilling for box state

## System Dependency Graph

```
intentEngine ← frameHistory
     ↓
   world (NEW)
     ↓
  runtime
```

The world resource depends on `intentEngine` and `frameHistory`, subscribes to intent events, and manages all 3D entity state.

## Key Insights

1. **`<primitive object={mesh} />` is the unlock** - R3F can render externally-owned Three.js objects
2. **One `useFrame`, globally** - Single update loop for deterministic ordering
3. **World owns the simulation** - React becomes a dumb projector
4. **Discriminated unions for extensibility** - Easy to add new entity types (spheres, particles, etc.)
5. **System layer is framework-agnostic** - Could swap React for anything

## Next Steps (Future)

- Add more entity types (spheres, particles, lights)
- Implement entity lifecycle events (spawn, destroy)
- Add spatial queries (find entities near point, in radius)
- Consider reactive entity updates (if needed)
- Extract world resource pattern to shared library

## Testing

Build passes with only pre-existing linter warnings:
- ✅ World resource compiles cleanly
- ✅ MainView refactor compiles cleanly
- ✅ System integration works
- ⚠️ Pre-existing warnings in FPSDisplay, HandSkeleton (unrelated)

## Philosophy Alignment

This migration perfectly aligns with HandWave's core philosophy:

> "No central governor. The system has no state machine orchestrating behavior. Pattern matching is pure functions. Conflict resolution is declarative. Events flow through subscriptions."

The World resource:
- ✅ No central governor (entities update independently)
- ✅ Event-driven (subscribes to intent events)
- ✅ Pure transformations (update() is deterministic)
- ✅ Clean separation (system owns logic, React renders)

**"World owns the simulation, React only renders."** 🎯

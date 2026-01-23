# Spatial Module

Pure functions for spatial operations in the intent engine.

## Overview

The spatial module provides three core capabilities:

1. **Coordinate Transforms** - Convert between normalized, viewport, and screen coordinates
2. **Grid System** - Discrete grid cells for stable spatial queries
3. **Hysteresis** - Prevent jittery cell transitions

## Why Spatial Grids?

MediaPipe outputs continuous hand positions (0-1 normalized coordinates). Raw positions are noisy and jitter constantly. The spatial grid system solves this:

- **Discretization** - Convert continuous positions to discrete grid cells
- **Stability** - Hysteresis prevents rapid cell switching at boundaries
- **Efficient queries** - Spatial hash enables O(1) neighbor lookups

### Example: Raw vs Grid

```typescript
// Raw position (jitters every frame)
{ x: 0.5001, y: 0.4998, z: 0 }
{ x: 0.4999, y: 0.5002, z: 0 }
{ x: 0.5003, y: 0.4997, z: 0 }

// Grid cell (stable)
{ col: 6, row: 4 }
{ col: 6, row: 4 }
{ col: 6, row: 4 }
```

## Coordinate Transforms

Convert positions between coordinate systems:

```typescript
import { transformCoordinates } from '@handwave/intent-engine'

// Normalized (0-1) → Viewport (pixels)
const viewportPos = transformCoordinates(
  { x: 0.5, y: 0.5, z: 0 },
  'normalized',
  'viewport',
  { x: 0, y: 0, width: 1920, height: 1080 }
)
// Result: { x: 960, y: 540, z: 0 }

// With horizontal mirroring
const mirrored = transformCoordinates(
  { x: 0.3, y: 0.5, z: 0 },
  'normalized',
  'normalized',
  viewport,
  true // mirrored
)
// Result: { x: 0.7, y: 0.5, z: 0 }
```

## Grid System

Convert positions to stable grid cells:

```typescript
import { normalizedToCell, cellToNormalized } from '@handwave/intent-engine'

const gridConfig = { cols: 12, rows: 8 }

// Position → Cell
const cell = normalizedToCell({ x: 0.5, y: 0.5, z: 0 }, gridConfig)
// Result: { col: 6, row: 4 }

// Cell → Position (center)
const position = cellToNormalized({ col: 6, row: 4 }, gridConfig)
// Result: { x: 0.5417, y: 0.5625, z: 0 }
```

### Spatial Hash

Efficient neighbor queries using grid-based spatial hashing:

```typescript
import { createSpatialHash } from '@handwave/intent-engine'

const hash = createSpatialHash({ cols: 12, rows: 8 })

// Insert particles
hash.insert({ x: 0.5, y: 0.5, z: 0 }, { id: 'particle-1' })
hash.insert({ x: 0.52, y: 0.52, z: 0 }, { id: 'particle-2' })
hash.insert({ x: 0.9, y: 0.9, z: 0 }, { id: 'particle-3' })

// Query nearby (radius = 0.1)
const nearby = hash.getNearby({ x: 0.5, y: 0.5, z: 0 }, 0.1)
// Returns: [particle-1, particle-2] (sorted by distance)
```

**Use cases:**
- Particle interactions (attract/repel within radius)
- Region detection ("is hand in this area?")
- Collision detection
- Clustering

**Performance:** O(1) insertion, O(k) query where k = cells in radius

## Hysteresis

Prevent rapid cell switching at boundaries:

```typescript
import { createHysteresisState, updateHysteresis } from '@handwave/intent-engine'

const gridConfig = { cols: 12, rows: 8 }
const hysteresisConfig = { threshold: 0.1 } // 10% of cell size

// Initial state
let state = createHysteresisState({ col: 6, row: 4 })

// Update with new position
state = updateHysteresis(
  state,
  { x: 0.51, y: 0.51, z: 0 }, // Slightly moved
  gridConfig,
  hysteresisConfig
)

// stableCell stays { col: 6, row: 4 } until position moves far enough
```

**How it works:**
- Track distance from stable cell center
- Only switch cells when distance exceeds threshold
- Prevents jitter at cell boundaries

**Threshold values:**
- `0.05` - Very sticky (5% of cell size)
- `0.1` - Default (10% of cell size)
- `0.2` - Less sticky (20% of cell size)

## Multi-Resolution Grids

Query at different granularities:

```typescript
import { createMultiResolutionSpatialHash } from '@handwave/intent-engine'

const hash = createMultiResolutionSpatialHash({
  coarse: { cols: 6, rows: 4 },   // Large regions
  medium: { cols: 12, rows: 8 },  // Default
  fine: { cols: 24, rows: 16 },   // Precise
})

// Insert once, query at any resolution
hash.insertAll({ x: 0.5, y: 0.5, z: 0 }, { id: 'particle' })

// Coarse query (large regions)
const coarse = hash.getNearby({ x: 0.5, y: 0.5, z: 0 }, 0.2, 'coarse')

// Fine query (precise)
const fine = hash.getNearby({ x: 0.5, y: 0.5, z: 0 }, 0.05, 'fine')
```

## Design Philosophy

**Pure functions** - All functions are pure transformations. State is explicit.

**No allocations in hot paths** - Spatial hash reuses query cache to avoid GC pressure.

**Predictable behavior** - Clear semantics, handles edge cases gracefully.

**Composable** - Small functions that combine into sophisticated spatial queries.

## API Reference

### Coordinates

- `transformCoordinates()` - Convert between coordinate systems
- `normalizedToViewport()` / `viewportToNormalized()` - Viewport transforms
- `normalizedToScreen()` / `screenToNormalized()` - Screen transforms
- `applyMirroring()` / `removeMirroring()` - Horizontal flip
- `clampNormalized()` - Clamp to [0, 1] range
- `isNormalizedInBounds()` - Check bounds
- `isInViewport()` - Check viewport bounds
- `getAspectRatio()` - Get viewport aspect ratio

### Grid

- `normalizedToCell()` / `cellToNormalized()` - Position ↔ Cell
- `getCellCenter()` - Get cell center position
- `getCellBounds()` - Get cell min/max bounds
- `getCellDimensions()` - Get cell width/height
- `isValidCell()` / `clampCell()` - Validation
- `getNeighborCells()` - 8-connected neighbors
- `getCardinalNeighbors()` - 4-connected neighbors
- `cellsEqual()` - Cell equality
- `cellManhattanDistance()` / `cellEuclideanDistance()` - Distance
- `createSpatialHash()` - Create spatial hash
- `createMultiResolutionSpatialHash()` - Multi-resolution hash

### Hysteresis

- `createHysteresisState()` - Create initial state
- `updateHysteresis()` - Update with new position
- `shouldSwitchCell()` - Check if should switch
- `calculateDistanceFromCenter()` - Distance from center
- `getStableCell()` - Get stable cell
- `isPositionStable()` - Check stability
- `resetHysteresis()` - Reset to new cell

## Performance Tips

1. **Reuse grid configs** - Create once, pass to functions
2. **Use appropriate resolution** - Coarse for large regions, fine for precision
3. **Limit query results** - Use `maxItems` parameter in `getNearby()`
4. **Clear spatial hash** - Call `clear()` when rebuilding from scratch

## Examples

See tests in `__tests__/grid.test.ts` for comprehensive examples.

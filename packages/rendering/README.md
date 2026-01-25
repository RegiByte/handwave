# @handwave/rendering

Reusable 2D rendering utilities and debug visualization tasks for HandWave projects.

## Installation

```bash
npm install @handwave/rendering @handwave/mediapipe @handwave/intent-engine
```

## Quick Start

```typescript
import { createFpsTask, createHandLandmarksTask } from '@handwave/rendering'
import { loopResource } from '@handwave/mediapipe'

// Create tasks with default configuration
const fpsTask = createFpsTask(loopState)
const handLandmarksTask = createHandLandmarksTask()

// Add to render loop
loop.addRenderTask(fpsTask)
loop.addRenderTask(handLandmarksTask)
```

## Philosophy

Every task is a **factory function** that accepts optional configuration, making them flexible and reusable across different projects. All config parameters have sensible defaults, so zero-config usage works out of the box.

## Task Catalog

### Debug Tasks

#### Grid Overlay

Displays a spatial grid overlay with hand position tracking.

```typescript
import { createGridOverlayTask } from '@handwave/rendering'

const gridTask = createGridOverlayTask({
  deadZone: { top: 0.05, bottom: 0.15, left: 0.05, right: 0.05 },
  targetCols: 12,
  showLabels: true,
  showHandPositions: true,
  showDeadZones: true,
  showInfo: true,
})
```

**Config Options:**
- `deadZone` - Margins where detection is unreliable (default: `{ top: 0.05, bottom: 0.15, left: 0.05, right: 0.05 }`)
- `targetCols` - Target number of columns (default: `12`)
- `showLabels` - Show cell coordinates (default: `true`)
- `showHandPositions` - Show hand positions on grid (default: `true`)
- `showDeadZones` - Highlight dead zones (default: `true`)
- `showInfo` - Show grid info panel (default: `true`)

#### Multi-Grid Overlay

Displays multiple grid resolutions simultaneously or individually.

```typescript
import { createMultiGridOverlayTask } from '@handwave/rendering'

const multiGridTask = createMultiGridOverlayTask({
  activeResolution: 'medium', // 'coarse' | 'medium' | 'fine' | 'all'
  showDeadZones: true,
  showCellLabels: true,
  showHandPositions: true,
  spatialData: () => getSpatialData(), // Optional worker spatial data
})
```

**Config Options:**
- `activeResolution` - Which grid(s) to show (default: `'medium'`)
- `showDeadZones` - Highlight dead zones (default: `true`)
- `showCellLabels` - Show cell coordinates (default: `true`)
- `showHandPositions` - Show hand positions (default: `true`)
- `spatialData` - Optional function returning worker-computed spatial data

#### Hand Landmark Labels

Shows landmark indices and names on each hand landmark.

```typescript
import { createHandLandmarkLabelsTask } from '@handwave/rendering'

const labelsTask = createHandLandmarkLabelsTask({
  fontSize: 10,
  showNames: true,
  colorScheme: 'default', // 'default' | 'monochrome'
})
```

**Config Options:**
- `fontSize` - Label font size (default: `10`)
- `showNames` - Show landmark names (default: `true`)
- `colorScheme` - Color scheme for labels (default: `'default'`)

#### Face Landmark Labels

Shows key face landmark indices and names.

```typescript
import { createFaceLandmarkLabelsTask } from '@handwave/rendering'

const faceLabelsTask = createFaceLandmarkLabelsTask({
  keyLandmarks: [
    { idx: 1, name: 'NOSE_TIP' },
    { idx: 152, name: 'CHIN' },
    // ... more landmarks
  ],
  fontSize: 10,
  showNames: true,
})
```

**Config Options:**
- `keyLandmarks` - Array of landmarks to display (default: 10 key landmarks)
- `fontSize` - Label font size (default: `10`)
- `showNames` - Show landmark names (default: `true`)

#### Hand Coordinates

Displays detailed 3D coordinates for hand landmarks in a panel.

```typescript
import { createHandCoordinatesTask } from '@handwave/rendering'

const coordsTask = createHandCoordinatesTask({
  position: 'top-right', // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  maxLandmarks: 10,
  panelWidth: 300,
})
```

**Config Options:**
- `position` - Panel position (default: `'top-right'`)
- `maxLandmarks` - Max landmarks to display (default: `10`)
- `panelWidth` - Panel width in pixels (default: `300`)

#### Blendshapes Display

Shows face blendshape coefficients with bars.

```typescript
import { createBlendshapesDisplayTask } from '@handwave/rendering'

const blendshapesTask = createBlendshapesDisplayTask({
  position: { x: 10, y: 100 },
  maxVisible: 20,
  panelWidth: 280,
})
```

**Config Options:**
- `position` - Panel position (default: `{ x: 10, y: 100 }`)
- `maxVisible` - Max blendshapes to display (default: `20`)
- `panelWidth` - Panel width in pixels (default: `280`)

#### Face Mesh Indices

Shows face mesh with vertex indices for debugging.

```typescript
import { createFaceMeshIndicesTask } from '@handwave/rendering'

const meshIndicesTask = createFaceMeshIndicesTask({
  fontSize: 8,
  showConnections: true,
  highlightRegions: ['eyes', 'lips', 'contours'],
})
```

**Config Options:**
- `fontSize` - Label font size (default: `8`)
- `showConnections` - Show mesh connections (default: `true`)
- `highlightRegions` - Regions to highlight (default: `['eyes', 'lips', 'contours']`)

#### Hand Custom Connections

Draws custom hand connections with distance-based coloring.

```typescript
import { createHandCustomConnectionsTask } from '@handwave/rendering'

const customConnectionsTask = createHandCustomConnectionsTask({
  connections: [
    { start: 0, end: 1 },
    { start: 4, end: 8, minDistance: 0.2 }, // Only draw if close
  ],
  colorScale: (distance) => `hsl(${120 * (1 - distance)}, 70%, 50%)`,
  lineWidth: 3,
  showDistanceColors: true,
})
```

**Config Options:**
- `connections` - Array of connections to draw (default: hand skeleton)
- `colorScale` - Function mapping distance to color (default: green to red)
- `lineWidth` - Base line width (default: `3`)
- `showDistanceColors` - Use distance-based coloring (default: `true`)

### UI Tasks

#### FPS Counter

Displays render and detection FPS.

```typescript
import { createFpsTask } from '@handwave/rendering'

const fpsTask = createFpsTask(loopState, {
  position: { x: 10, y: 10 },
  showWorkerFPS: true,
  fontSize: 14,
})
```

**Config Options:**
- `position` - Counter position (default: top-right)
- `showWorkerFPS` - Show detection FPS (default: `true`)
- `fontSize` - Font size (default: `14`)

#### Pause Indicator

Shows pause indicator when loop is paused.

```typescript
import { createPauseIndicatorTask } from '@handwave/rendering'

const pauseTask = createPauseIndicatorTask(loopState, {
  position: 'top', // 'center' | 'top' | 'bottom'
  text: '⏸ PAUSED',
  fontSize: 28,
})
```

**Config Options:**
- `position` - Indicator position (default: `'top'`)
- `text` - Pause text (default: `'⏸ PAUSED'`)
- `fontSize` - Font size (default: `28`)

#### Gesture Labels

Shows detected gesture names with handedness.

```typescript
import { createGestureLabelsTask } from '@handwave/rendering'

const gestureLabelsTask = createGestureLabelsTask({
  position: { x: 10, y: 30 },
  fontSize: 18,
  showConfidence: true,
  showHandedness: true,
})
```

**Config Options:**
- `position` - Label position (default: `{ x: 10, y: 30 }`)
- `fontSize` - Font size (default: `18`)
- `showConfidence` - Show confidence percentage (default: `true`)
- `showHandedness` - Show left/right hand (default: `true`)

### Landmark Tasks

#### Hand Landmarks

Draws hand landmarks and connections.

```typescript
import { createHandLandmarksTask } from '@handwave/rendering'

const handLandmarksTask = createHandLandmarksTask({
  connectionColor: '#FF6B6B',
  landmarkColor: '#00FF88',
  lineWidth: 4,
  radius: 3,
})
```

**Config Options:**
- `connectionColor` - Connection line color (default: `'#FF6B6B'`)
- `landmarkColor` - Landmark dot color (default: `'#00FF88'`)
- `lineWidth` - Connection line width (default: `4`)
- `radius` - Landmark dot radius (default: `3`)

#### Pinch Rings

Highlights fingertips with rings when close to thumb (pinch detection).

```typescript
import { createPinchRingsTask } from '@handwave/rendering'

const pinchRingsTask = createPinchRingsTask({
  threshold: 0.07,
  ringRadius: 18,
  color: '0, 255, 136', // RGB string
  glowRadius: 22,
  lineWidth: 4,
})
```

**Config Options:**
- `threshold` - Distance threshold for pinch (default: `0.07`)
- `ringRadius` - Main ring radius (default: `18`)
- `color` - RGB color string (default: `'0, 255, 136'`)
- `glowRadius` - Outer glow radius (default: `22`)
- `lineWidth` - Ring line width (default: `4`)

### Intent-Aware Tasks

#### Gesture Duration

Shows gesture name and held duration at hand center of mass.

```typescript
import { createGestureDurationTask } from '@handwave/rendering'

const durationTask = createGestureDurationTask(frameHistory, {
  fontSize: 20,
  showBackground: true,
  colorByHandedness: true,
})
```

**Config Options:**
- `fontSize` - Label font size (default: `20`)
- `showBackground` - Show background box (default: `true`)
- `colorByHandedness` - Color by left/right hand (default: `true`)

**Note:** Requires a `frameHistory` object with `getContinuousDuration` method.

## Custom Tasks

You can create your own render tasks by implementing the `RenderTask` type:

```typescript
import type { RenderTask } from '@handwave/mediapipe'

const myCustomTask: RenderTask = ({ ctx, gestureResult, viewport, mirrored }) => {
  if (!gestureResult?.landmarks?.length) return
  
  // Your custom rendering logic
  ctx.fillStyle = 'white'
  ctx.fillText('Hello HandWave!', 10, 10)
}
```

Or create a factory for configurable tasks:

```typescript
type MyTaskConfig = {
  color?: string
  fontSize?: number
}

const createMyTask = (config?: MyTaskConfig): RenderTask => {
  const color = config?.color ?? 'white'
  const fontSize = config?.fontSize ?? 16
  
  return ({ ctx }) => {
    ctx.fillStyle = color
    ctx.font = `${fontSize}px monospace`
    ctx.fillText('Configured!', 10, 10)
  }
}
```

## Examples

### Debug Mode

Show all debug overlays:

```typescript
import {
  createGridOverlayTask,
  createHandLandmarkLabelsTask,
  createFaceLandmarkLabelsTask,
  createHandCoordinatesTask,
  createFpsTask,
} from '@handwave/rendering'

const debugTasks = [
  createGridOverlayTask(),
  createHandLandmarkLabelsTask(),
  createFaceLandmarkLabelsTask(),
  createHandCoordinatesTask(),
  createFpsTask(loopState),
]

debugTasks.forEach(task => loop.addRenderTask(task))
```

### Production Mode

Minimal UI for production:

```typescript
import {
  createHandLandmarksTask,
  createGestureLabelsTask,
  createPinchRingsTask,
} from '@handwave/rendering'

const productionTasks = [
  createHandLandmarksTask({
    connectionColor: '#4A90E2',
    landmarkColor: '#50E3C2',
  }),
  createGestureLabelsTask({
    showConfidence: false,
  }),
  createPinchRingsTask(),
]

productionTasks.forEach(task => loop.addRenderTask(task))
```

### Custom Styled Grid

Customize grid appearance:

```typescript
import { createGridOverlayTask } from '@handwave/rendering'

const styledGrid = createGridOverlayTask({
  deadZone: { top: 0.1, bottom: 0.2, left: 0.1, right: 0.1 },
  targetCols: 16,
  showLabels: false,
  showDeadZones: false,
  showInfo: false,
})
```

## Architecture

The rendering package follows HandWave's core principles:

- **Higher-Order Functions** - Every task is a factory accepting configuration
- **Sensible Defaults** - Zero-config usage works out of the box
- **Type Safety** - Full TypeScript with exported config types
- **Separation of Concerns** - Visual representation only, no business logic

## Dependencies

- `@handwave/mediapipe` - Detection and infrastructure
- `@handwave/intent-engine` - Gesture semantics (for some tasks)
- `@mediapipe/tasks-vision` - MediaPipe types

## Browser Compatibility

Same as `@handwave/mediapipe`:
- Chrome/Edge 89+
- Firefox 79+
- Safari 15.2+

## License

MIT

## Related Packages

- `@handwave/mediapipe` - MediaPipe detection adapter
- `@handwave/intent-engine` - Declarative gesture intent DSL
- `@handwave/system` - Render loop and task pipeline
- `@handwave/react` - React integration hooks

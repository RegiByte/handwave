# @handwave/mediapipe

MediaPipe detection adapter for HandWave. Provides real-time hand and face tracking using Google's MediaPipe.

## Installation

```bash
npm install @handwave/mediapipe @handwave/system @handwave/intent-engine
```

## Requirements

- **Bundler:** Requires Vite or a bundler with Web Worker support (uses Vite's `?worker` syntax)
- **Browser:** Modern browser with WebAssembly and SharedArrayBuffer support
- **HTTPS:** Required for camera access (or localhost for development)
- **Headers:** Requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for SharedArrayBuffer

Vite automatically configures these headers in dev and preview modes.

## Quick Start

```typescript
import { 
  cameraResource, 
  detectionWorkerResource, 
  canvasResource,
  frameRater,
  loopResource,
} from '@handwave/mediapipe'
import { startSystem } from 'braided'

// Create your system with MediaPipe resources
const system = {
  camera: cameraResource,
  detectionWorker: detectionWorkerResource,
  canvas: canvasResource,
  frameRater: frameRater,
  loop: loopResource,
}

// Start the system
const { system: startedSystem } = await startSystem(system)

// Access detection results
const loop = startedSystem.loop
loop.state.subscribe((state) => {
  console.log('FPS:', state.fps)
  console.log('Worker FPS:', state.workerFPS)
})
```

## Architecture

The MediaPipe adapter consists of:

### 1. Detection Resources

- **camera** - getUserMedia camera access with device selection
- **detectionWorker** - Web Worker orchestration for off-thread detection
- **canvas** - Canvas utilities and drawing helpers
- **frameRater** - FPS throttling and frame rate management
- **loop** - Main render loop with task pipeline

### 2. Worker System

Detection runs in a Web Worker for 60 FPS rendering on the main thread:

- Worker loads MediaPipe models independently
- Main thread sends VideoFrame objects (zero-copy transfer)
- Worker processes frames at 25-30 FPS (optimal for MediaPipe)
- Results communicated via SharedArrayBuffer (zero-copy)

### 3. Shared Buffers

Zero-copy SharedArrayBuffer communication:

```typescript
import { 
  createDetectionSharedBuffer,
  reconstructDetectionResults 
} from '@handwave/mediapipe'

// Create shared buffer
const buffer = createDetectionSharedBuffer()

// Worker writes detection results
writeDetectionResults(buffer, faceResult, gestureResult)

// Main thread reads results (zero-copy)
const results = reconstructDetectionResults(buffer)
```

### 4. Task Infrastructure

Extensible render task system:

```typescript
import type { RenderTask } from '@handwave/mediapipe'

const myTask: RenderTask = (context) => {
  const { ctx, width, height, gestureResult } = context
  
  // Draw on canvas
  ctx.fillStyle = 'white'
  ctx.fillText('Hello', 10, 10)
}
```

## Worker Bundling

This package uses Vite's `?worker` syntax to bundle the detection worker:

```typescript
() => import('../worker/kernel/workerScript?worker')
```

**For Vite users:** Works automatically out of the box.

**For other bundlers:** May require configuration. The worker needs to be bundled as a separate chunk and loaded as a module worker.

If you encounter issues with worker loading, please open an issue. We're exploring options for broader bundler compatibility.

## Performance

- **Detection FPS:** 25-30 FPS (optimal for MediaPipe)
- **Main Thread FPS:** 60-120 FPS (detection runs in worker)
- **Frame Creation:** 0.02ms (VideoFrame API)
- **Zero-copy:** SharedArrayBuffer for results transfer

## API Reference

### Detection Resources

```typescript
// Camera
import { cameraResource, type CameraAPI } from '@handwave/mediapipe'

// Detection Worker
import { detectionWorkerResource, type DetectionWorkerResource } from '@handwave/mediapipe'

// Loop
import { loopResource, type LoopResource } from '@handwave/mediapipe'

// Canvas
import { canvasResource, type CanvasAPI } from '@handwave/mediapipe'

// Frame Rater
import { frameRater, type FrameRaterAPI } from '@handwave/mediapipe'
```

### Shared Buffer Utilities

```typescript
import {
  createDetectionSharedBuffer,
  reconstructDetectionResults,
  writeDetectionResults,
  GESTURE_NAMES,
  BLENDSHAPE_NAMES,
} from '@handwave/mediapipe'
```

### Task Infrastructure

```typescript
import {
  type RenderTask,
  type RenderContext,
  mapLandmarkToViewport,
  transformLandmarksToViewport,
} from '@handwave/mediapipe'
```

### System Configuration

```typescript
import {
  mediapipeSystemConfig,
  mediapipeManager,
  useMediapipeSystem,
  useMediapipeResource,
} from '@handwave/mediapipe'
```

## Example: Custom Render Task

```typescript
import type { RenderTask } from '@handwave/mediapipe'
import { mapLandmarkToViewport } from '@handwave/mediapipe'

const handSkeletonTask: RenderTask = ({ 
  ctx, 
  gestureResult, 
  viewport,
  mirrored 
}) => {
  if (!gestureResult?.landmarks) return
  
  for (const hand of gestureResult.landmarks) {
    // Draw each landmark
    for (const landmark of hand) {
      const pos = mapLandmarkToViewport(landmark, viewport, mirrored)
      ctx.fillStyle = 'white'
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
```

## Example: Extending the System

```typescript
import {
  cameraResource,
  detectionWorkerResource,
  canvasResource,
  frameRater,
  loopResource,
} from '@handwave/mediapipe'
import { myCustomResource } from './myCustomResource'

// Extend base MediaPipe system with your own resources
const mySystem = {
  camera: cameraResource,
  detectionWorker: detectionWorkerResource,
  canvas: canvasResource,
  frameRater: frameRater,
  loop: loopResource,
  myCustom: myCustomResource, // Add your own!
}
```

## Browser Compatibility

- Chrome/Edge 89+
- Firefox 79+
- Safari 15.2+

All require SharedArrayBuffer support and HTTPS (or localhost).

## License

MIT

## Contributing

Issues and PRs welcome! This package is part of the HandWave monorepo.

## Related Packages

- `@handwave/intent-engine` - Declarative gesture intent DSL
- `@handwave/system` - Render loop and task pipeline
- `@handwave/react` - React integration hooks

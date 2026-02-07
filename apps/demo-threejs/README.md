# HandWave Three.js Demo

3D gesture-controlled demo showcasing HandWave's intent engine with React Three Fiber.

## Features

- **Real-time Hand Tracking**: MediaPipe hand detection at 60 FPS
- **3D Hand Cursors**: Visualize hand positions in 3D space
- **Video Overlay**: Camera feed displayed in corner
- **React Three Fiber**: Declarative 3D scene composition
- **Braided Resources**: Clean lifecycle management

## Getting Started

```bash
# Install dependencies (from workspace root)
npm install

# Start dev server
cd apps/demo-threejs
npm run dev
```

Open http://localhost:5173 (or the port shown in terminal)

## Architecture

### System Integration

The demo uses the HandWave system architecture:

```
MediaPipe Worker (60 FPS) 
  → Frame History Buffer 
  → Intent Engine 
  → React Components
```

**Key Resources:**
- `camera` - Webcam access
- `detectionWorker` - MediaPipe processing (Web Worker)
- `canvas` - 2D video rendering
- `loop` - Render loop coordination
- `frameHistory` - Temporal pattern buffer
- `intentEngine` - Gesture → Intent conversion
- `runtime` - System orchestration

### Hand Position Mapping

Hand tracking coordinates are transformed from 2D viewport space to 3D world space:

```typescript
// Normalized coordinates [0, 1] → World space [-5, 5]
const worldX = mirrored 
  ? (1 - normalizedX) * 10 - 5  // Mirror horizontally
  : normalizedX * 10 - 5

// Invert Y (screen Y increases down, world Y increases up)
const worldY = (1 - normalizedY) * 10 - 5

// Fixed Z depth (for now)
const worldZ = 0
```

## Project Structure

```
apps/demo-threejs/
├── src/
│   ├── system/
│   │   ├── system.ts              # System configuration
│   │   └── resources/
│   │       ├── runtime.ts         # System orchestration
│   │       ├── frameHistoryResource.ts
│   │       └── intentEngineResource.ts
│   ├── components/
│   │   ├── MainView.tsx           # Main integration component
│   │   └── HandCursor.tsx         # 3D hand visualization
│   └── routes/
│       ├── __root.tsx             # SystemProvider wrapper
│       └── index.tsx              # Route definition
```

## Next Steps

### Phase 1: Object Manipulation
- [ ] Spawn 3D primitives (cubes, spheres, toruses)
- [ ] Grab objects with pinch gesture
- [ ] Move objects in 3D space
- [ ] Delete objects with specific gesture

### Phase 2: Two-Hand Interactions
- [ ] Two-hand scaling (distance between hands)
- [ ] Two-hand rotation (relative motion)
- [ ] Bidirectional patterns (either hand can be modifier/action)

### Phase 3: Depth Integration
- [ ] Use hand Z-axis for depth positioning
- [ ] Push/pull objects in 3D
- [ ] Depth-aware spatial queries

### Phase 4: Gesture Sequences
- [ ] Implement sequence support in DSL
- [ ] Multi-step operations (spawn → position → scale → confirm)
- [ ] Concurrent sequences (left hand sequences while right holds)

### Phase 5: World Coordinates
- [ ] 3D spatial grid visualization
- [ ] Volume-based spatial queries
- [ ] World-space gesture detection

## Development

### Type Checking
```bash
npm run type:check
```

### Building
```bash
npm run build
```

### Linting
```bash
npm run lint
```

## Technical Notes

### Why React Three Fiber?

R3F provides:
- Declarative 3D scene composition
- React lifecycle integration
- Clean cleanup/disposal
- TypeScript support
- Easy drop-down to raw Three.js when needed

### Performance

- MediaPipe runs in Web Worker (off main thread)
- Zero-copy SharedArrayBuffer for frame data
- 60 FPS hand tracking
- R3F render loop synchronized with detection

### Coordinate Systems

**MediaPipe Output:**
- Normalized coordinates [0, 1]
- Origin: top-left
- Y-axis: increases downward

**Three.js World Space:**
- World units (configurable)
- Origin: center
- Y-axis: increases upward

**Transformation:**
- Mirror horizontally (selfie mode)
- Invert Y-axis
- Scale to world units
- Center around origin

## Resources

- [HandWave Documentation](../../.regibyte/)
- [React Three Fiber Docs](https://docs.pmnd.rs/react-three-fiber)
- [Three.js Docs](https://threejs.org/docs/)
- [MediaPipe Hand Tracking](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker)

# Render Loop

A generic, reusable render loop abstraction for any frame-based system.

## Philosophy

- **Generic context type** - Works with 2D canvas, 3D R3F, audio, or any frame-based system
- **Lifecycle hooks** - `beforeRender` and `afterRender` for custom logic
- **FPS throttling** - Optional target FPS for performance control
- **Clean state management** - Simple running/paused states
- **Error handling** - Graceful error recovery with optional error handler

## Usage

### Basic Example

```typescript
import { createRenderLoop } from '@handwave/system'

const loop = createRenderLoop({
  createContext: () => ({
    ctx: canvas.getContext('2d')!,
    tasks: [],
  }),
  beforeRender: (context, timestamp, deltaMs) => {
    // Update state before rendering
    context.ctx.clearRect(0, 0, canvas.width, canvas.height)
  },
  afterRender: (context, timestamp, deltaMs) => {
    // Execute render tasks
    context.tasks.forEach(task => task(context))
  },
})

loop.start()
```

### With FPS Throttling

```typescript
const loop = createRenderLoop({
  createContext: () => ({ /* ... */ }),
  afterRender: (context) => {
    // Render at 30 FPS
  },
  targetFPS: 30, // Throttle to 30 FPS
})
```

### With Error Handling

```typescript
const loop = createRenderLoop({
  createContext: () => ({ /* ... */ }),
  afterRender: (context) => {
    // May throw errors
  },
  onError: (error) => {
    console.error('Render error:', error)
    // Optionally recover or stop loop
  },
})
```

### Pause and Resume

```typescript
loop.start()

// Pause rendering
loop.pause()

// Resume rendering
loop.resume()

// Stop completely
loop.stop()
```

### Access Context

```typescript
const context = loop.getContext()
if (context) {
  // Access render context
  console.log(context.ctx)
}
```

## Braided Resource

Use `createRenderLoopResource` to integrate with Braided:

```typescript
import { createRenderLoopResource } from '@handwave/system'

const renderLoopResource = createRenderLoopResource({
  createContext: () => ({
    ctx: canvas.getContext('2d')!,
    tasks: [],
  }),
  afterRender: (context) => {
    context.tasks.forEach(task => task(context))
  },
})

// In Braided app
const loop = useResource(renderLoopResource)
```

The resource automatically:
- Starts the loop on mount
- Stops the loop on unmount
- Handles cleanup

## API Reference

### `createRenderLoop<TContext>(options)`

Creates a render loop with the specified options.

**Options:**
- `createContext: () => TContext` - Factory function to create the render context
- `beforeRender?: (context, timestamp, deltaMs) => void` - Called before each frame
- `afterRender?: (context, timestamp, deltaMs) => void` - Called after each frame
- `onError?: (error: Error) => void` - Error handler for lifecycle hooks
- `targetFPS?: number` - Optional target FPS for throttling

**Returns:** `RenderLoopAPI<TContext>`

### `RenderLoopAPI<TContext>`

**Methods:**
- `start()` - Start the render loop (idempotent)
- `stop()` - Stop the render loop
- `pause()` - Pause the render loop
- `resume()` - Resume the render loop
- `isRunning()` - Check if loop is running
- `isPaused()` - Check if loop is paused
- `getContext()` - Get the current context (or null if not started)

### `createRenderLoopResource<TContext>(options)`

Creates a Braided resource for a render loop.

**Options:** Same as `createRenderLoop`

**Returns:** Braided resource definition

## Examples

### 2D Canvas Rendering

```typescript
const loop = createRenderLoop({
  createContext: () => ({
    ctx: canvas.getContext('2d')!,
    width: canvas.width,
    height: canvas.height,
  }),
  beforeRender: (context) => {
    context.ctx.clearRect(0, 0, context.width, context.height)
  },
  afterRender: (context) => {
    // Draw something
    context.ctx.fillStyle = 'red'
    context.ctx.fillRect(10, 10, 100, 100)
  },
})
```

### React Three Fiber (Future)

```typescript
const loop = createRenderLoop({
  createContext: () => ({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: new THREE.WebGLRenderer(),
  }),
  afterRender: (context) => {
    context.renderer.render(context.scene, context.camera)
  },
})
```

### Audio Processing

```typescript
const loop = createRenderLoop({
  createContext: () => ({
    audioContext: new AudioContext(),
    analyser: audioContext.createAnalyser(),
  }),
  afterRender: (context) => {
    const dataArray = new Uint8Array(context.analyser.frequencyBinCount)
    context.analyser.getByteFrequencyData(dataArray)
    // Process audio data
  },
  targetFPS: 60, // Audio visualization at 60 FPS
})
```

## Design Decisions

### Why Generic Context?

Different rendering systems need different context types:
- 2D canvas needs `CanvasRenderingContext2D`
- 3D needs scene, camera, renderer
- Audio needs `AudioContext` and analyzers

Generic context type provides maximum flexibility.

### Why Separate beforeRender and afterRender?

- `beforeRender` - Update state, clear canvas, prepare for rendering
- `afterRender` - Execute render tasks, draw to screen

Clear separation of concerns makes the loop more composable.

### Why Optional FPS Throttling?

Some use cases need to run at lower FPS for performance:
- Audio visualization at 30 FPS
- Background processing at 10 FPS
- Full speed at 60 FPS (default)

Optional throttling provides flexibility without complexity.

### Why Braided Resource?

Braided resources provide:
- Automatic lifecycle management
- Cleanup on unmount
- Dependency injection
- Composability with other resources

The resource wrapper makes integration seamless.

## Testing

The render loop is fully tested with 11 test cases covering:
- Start/stop lifecycle
- Pause/resume
- Hook execution
- Error handling
- FPS throttling
- Context access
- Idempotency

See `__tests__/renderLoop.test.ts` for examples.

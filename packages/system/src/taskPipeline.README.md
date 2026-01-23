# Task Pipeline

Generic task execution pipeline with lifecycle management. Composable tasks with init/execute/cleanup lifecycle and error handling.

## Philosophy

- **Simple rules compose** - Tasks are isolated, composable units
- **No central governor** - Pipeline just executes, doesn't orchestrate state
- **Context is data** - State flows through as immutable context
- **Pause/resume is context** - Pipeline doesn't own state, executor decides

## Core Concepts

### Task Types

**Simple Function Task:**
```typescript
const task = (context: RenderContext) => {
  // Execute logic
}
```

**Lifecycle Task:**
```typescript
const task = {
  init: (initContext) => {
    // Setup: subscribe to events, allocate resources
  },
  execute: (context) => {
    // Execute: called every frame/tick
  },
  cleanup: () => {
    // Teardown: unsubscribe, free resources
  },
}
```

### Context Types

**Init Context** - Provided once when task is added:
```typescript
type InitContext = {
  intentEngine: IntentEngineAPI
  loopState: LoopState
}
```

**Execution Context** - Provided on every execute call:
```typescript
type ExecutionContext = {
  canvas: CanvasRenderingContext2D
  video: HTMLVideoElement
  timestamp: number
  paused: boolean
}
```

## API

### `createTaskPipeline(options)`

Create a new task pipeline.

**Options:**
- `contextInit: () => TContextInit` - Function that returns init context for each task
- `onError?: (error, task) => void` - Optional error handler

**Returns:** `TaskPipeline<TContext, TContextInit>`

```typescript
const pipeline = createTaskPipeline<RenderContext, InitContext>({
  contextInit: () => ({
    intentEngine,
    loopState,
  }),
  onError: (error, task) => {
    console.error('Task error:', error)
  },
})
```

### `pipeline.addTask(task)`

Add a task to the pipeline. Returns a promise that resolves to an unsubscribe function.

**Async Init:**
- If task has async init, `addTask` waits for it to complete
- If same task instance is added multiple times concurrently, init only runs once
- Task is only added to execution queue after init completes

```typescript
// Simple function task
const unsubscribe = await pipeline.addTask((ctx) => {
  ctx.canvas.fillRect(0, 0, 100, 100)
})

// Lifecycle task
const unsubscribe = await pipeline.addTask({
  init: async (initCtx) => {
    // Subscribe to events
    initCtx.intentEngine.on('spawn', handleSpawn)
  },
  execute: (ctx) => {
    // Render particles
    particles.forEach(p => renderParticle(ctx, p))
  },
  cleanup: () => {
    // Unsubscribe from events
    particles = []
  },
})

// Remove task
unsubscribe()
```

### `pipeline.execute(context)`

Execute all tasks with the given context. Only executes tasks that have completed initialization.

```typescript
pipeline.execute({
  canvas: ctx,
  video: videoElement,
  timestamp: performance.now(),
  paused: false,
})
```

### `pipeline.clear()`

Remove all tasks, calling cleanup on each lifecycle task.

```typescript
pipeline.clear()
```

## Usage Patterns

### Render Loop

```typescript
type RenderContext = {
  canvas: CanvasRenderingContext2D
  video: HTMLVideoElement
  timestamp: number
  deltaMs: number
  paused: boolean
}

type InitContext = {
  intentEngine: IntentEngineAPI
  loopState: LoopState
}

const pipeline = createTaskPipeline<RenderContext, InitContext>({
  contextInit: () => ({
    intentEngine: getIntentEngine(),
    loopState: getLoopState(),
  }),
  onError: (error) => console.error('Render task error:', error),
})

// Add tasks
await pipeline.addTask(createParticlesTask())
await pipeline.addTask(createFpsCounterTask())
await pipeline.addTask(createVideoBackdropTask())

// Render loop
function render(timestamp: number) {
  const deltaMs = timestamp - lastTimestamp
  lastTimestamp = timestamp

  pipeline.execute({
    canvas: ctx,
    video: videoElement,
    timestamp,
    deltaMs,
    paused: isPaused,
  })

  requestAnimationFrame(render)
}
```

### Particle System

```typescript
const createParticlesTask = () => {
  const particles: Particle[] = []

  return {
    init: (ctx: InitContext) => {
      // Subscribe to intent events
      ctx.intentEngine.on('particles:spawn', (event) => {
        spawnParticles(particles, event.position)
      })

      ctx.intentEngine.on('particles:clear', () => {
        particles.length = 0
      })
    },
    execute: (ctx: RenderContext) => {
      if (!ctx.paused) {
        // Update physics
        particles.forEach(p => updateParticle(p, ctx.deltaMs))
      }

      // Render
      particles.forEach(p => renderParticle(ctx.canvas, p))
    },
    cleanup: () => {
      particles.length = 0
    },
  }
}
```

### FPS Counter

```typescript
const createFpsCounterTask = (loopState: LoopState) => {
  return (ctx: RenderContext) => {
    const { fps } = loopState.get()
    ctx.canvas.fillText(`FPS: ${fps}`, 10, 20)
  }
}
```

### Video Backdrop with Caching

```typescript
const createVideoBackdropTask = () => {
  let cachedBackdrop: ImageBitmap | null = null

  return {
    execute: (ctx: RenderContext) => {
      // Recompute backdrop at low FPS
      if (shouldRecompute(ctx.timestamp)) {
        createImageBitmap(ctx.video).then(bitmap => {
          cachedBackdrop?.close()
          cachedBackdrop = bitmap
        })
      }

      // Always render cached backdrop (fast)
      if (cachedBackdrop) {
        ctx.canvas.drawImage(cachedBackdrop, 0, 0)
      }
    },
    cleanup: () => {
      cachedBackdrop?.close()
      cachedBackdrop = null
    },
  }
}
```

## Design Decisions

### Why Pause/Resume is Context State

**Instead of:**
```typescript
pipeline.pause()
pipeline.resume()
```

**We do:**
```typescript
pipeline.execute({ paused: true, ...context })
```

**Rationale:**
- Pipeline doesn't own state, it transforms data
- Executor decides what to do with pause state
- Tasks can choose to respect it or ignore it
- More flexible and composable

### Why contextInit is a Function

**Instead of:**
```typescript
createTaskPipeline({ contextInit: { engine, state } })
```

**We do:**
```typescript
createTaskPipeline({ contextInit: () => ({ engine, state }) })
```

**Rationale:**
- Re-evaluated for each task added
- Fresh context for each task
- Prevents stale references
- Allows context to change over time

### Why Async Init is Tracked

**Problem:** Multiple concurrent `addTask` calls with same task instance

**Solution:** WeakMap tracks initialization promises

```typescript
const task = { init: async () => { /* expensive setup */ }, execute: () => {} }

// Both calls share the same init promise
const [unsub1, unsub2] = await Promise.all([
  pipeline.addTask(task),
  pipeline.addTask(task),
])
```

**Rationale:**
- Prevents duplicate initialization
- Efficient resource usage
- Predictable behavior

### Why Array Instead of Set

**Rationale:**
- Task execution order matters (backdrop before particles)
- Array preserves insertion order explicitly
- Easier to reason about

### Why Optional Error Handler

**Without handler:** Errors throw and stop pipeline

**With handler:** Errors are caught, other tasks continue

```typescript
createTaskPipeline({
  contextInit: () => ({}),
  onError: (error, task) => {
    console.error('Task failed:', error)
    // Continue executing other tasks
  },
})
```

**Rationale:**
- Flexibility: strict mode (throw) or resilient mode (catch)
- Production: log errors, continue rendering
- Development: throw errors, catch bugs early

## Performance Considerations

### Async Init

- Init runs when task is added, not during execute
- Execute loop stays synchronous and fast
- No async overhead in render loop

### Error Handling

- Try/catch per task has minimal overhead
- Only active when error handler is provided
- Errors don't stop other tasks

### Task Ordering

- Array iteration is fast (cache-friendly)
- No sorting or priority logic
- Simple, predictable performance

## Testing

See `__tests__/taskPipeline.test.ts` for comprehensive test coverage:

- Simple function tasks
- Lifecycle tasks with init/execute/cleanup
- Async init with deduplication
- Error handling (with and without handler)
- Clear with cleanup
- Mixed simple and lifecycle tasks
- Real-world patterns (particles, FPS counter)

## Future Enhancements

Potential additions (YAGNI until needed):

- **Task priority** - Execute high-priority tasks first
- **Conditional execution** - Skip tasks based on predicate
- **Task groups** - Enable/disable groups of tasks
- **Performance monitoring** - Track execution time per task
- **Async execute** - Support async task execution (careful: can break frame timing)

## Related Patterns

- **Observer pattern** - Tasks subscribe to events in init
- **Strategy pattern** - Tasks are interchangeable strategies
- **Pipeline pattern** - Data flows through stages
- **Middleware pattern** - Tasks transform context

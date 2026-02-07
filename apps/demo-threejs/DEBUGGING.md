# Debugging Guide - Three.js Demo

## Current Issue: Empty Detection Frames

**Symptom:** Detection frames are coming back with empty `detectors: {}` object.

```json
{
  "timestamp": 29042.715,
  "detectionFrame": {
    "timestamp": 29042.715,
    "detectors": {}  // ❌ Should have hand/face data
  }
}
```

## Checklist

### 1. Check Browser Console

Look for these log messages in order:

```
[Detection Worker Resource] Starting...
[Detection Worker Resource] ✅ Worker ready
[Runtime] Starting system
[Loop] Starting...
[Loop] Initializing worker detection...
[Loop] ✅ Using SharedArrayBuffer for zero-copy results
[Loop] ✅ Worker detection initialized
[Loop] Emitting workerReady event...
```

### 2. Check for Errors

**Common errors:**

- **CORS/COOP errors**: "SharedArrayBuffer is not defined"
  - **Fix**: Restart dev server after vite.config.ts changes
  - **Verify**: Check `crossOriginIsolated` in console: `console.log(crossOriginIsolated)` should be `true`

- **MediaPipe model loading errors**: "Failed to fetch model"
  - **Fix**: Check network tab for 404s on MediaPipe CDN
  - **Models should load from**: `https://storage.googleapis.com/mediapipe-models/`

- **Worker initialization errors**: "Worker failed to initialize"
  - **Fix**: Check worker console (separate tab in DevTools)
  - **Look for**: MediaPipe WASM loading errors

### 3. Verify SharedArrayBuffer

In browser console:

```javascript
// Should return true
console.log(crossOriginIsolated)

// Should return function
console.log(typeof SharedArrayBuffer)
```

### 4. Check Camera Permissions

- Camera permission should be granted
- Video element should show camera feed (check in canvas overlay)
- If no video: check browser camera permissions

### 5. Check Worker Console

Chrome DevTools → Sources → Threads → Select worker thread

Look for:
```
[Worker] Initializing MediaPipe models...
[Worker] ✅ Hand detection initialized
[Worker] ✅ Face detection initialized
[Worker] Detection loop started
```

### 6. Manual Detection Test

In browser console:

```javascript
// Get the detection worker resource
const system = window.__handwave_system // (if exposed)
const worker = system?.detectionWorker

// Check initialization status
console.log('Worker initialized:', worker?.isInitialized())

// Check SharedArrayBuffer status
console.log('SAB enabled:', worker?.isSharedArrayBufferEnabled())
```

## Expected Behavior

**When working correctly:**

1. Video canvas overlay shows camera feed
2. Console shows successful initialization
3. Detection frames have hand/face data:

```json
{
  "timestamp": 29042.715,
  "detectionFrame": {
    "timestamp": 29042.715,
    "detectors": {
      "hand": [
        {
          "handedness": "left",
          "landmarks": [...],
          "worldLandmarks": [...]
        }
      ]
    }
  }
}
```

4. Hand cursors appear in 3D scene when hands visible
5. Status overlay shows "Hands: 1" or "Hands: 2"

## Quick Fixes

### Restart Dev Server

```bash
# Kill dev server (Ctrl+C)
npm run dev
```

### Clear Browser Cache

1. Open DevTools
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

### Check Vite Config

Verify `apps/demo-threejs/vite.config.ts` has:

```typescript
worker: {
  format: 'iife',
},
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
},
```

## Still Not Working?

### Enable Verbose Logging

Add to `MainView.tsx`:

```typescript
useEffect(() => {
  const unsubscribe = loop.frame$.subscribe((frameData) => {
    console.log('[MainView] Frame:', {
      timestamp: frameData.timestamp,
      hasDetection: !!frameData.enrichedDetectionFrame,
      detectors: frameData.enrichedDetectionFrame?.detectors,
      handCount: frameData.enrichedDetectionFrame?.detectors?.hand?.length ?? 0,
    })
    setDetectionFrame(frameData.enrichedDetectionFrame)
  })
  return () => unsubscribe()
}, [loop])
```

### Check Loop Initialization

Add to `runtime.ts` start command:

```typescript
[mediapipeKeywords.commands.start]: async () => {
  console.log('[Runtime] Starting system')
  await loadDevices()
  
  console.log('[Runtime] Loop status:', {
    isRunning: loop.isRunning?.(),
    workerInitialized: detectionWorker.isInitialized(),
  })
  
  loop.start()
  
  // ... rest of code
}
```

## Next Steps

Once detection is working:

1. ✅ Hand cursors should appear in 3D space
2. ✅ Video overlay should show camera feed with hand tracking
3. ✅ Status should show hand count
4. 🎯 Ready to implement object spawning and manipulation!

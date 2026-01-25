# Intent Engine Vocabulary

**Philosophy:** No magic strings, no drift, single source of truth.

---

## Overview

The vocabulary pattern is a core architectural principle in this codebase. All string constants and schemas are centralized in vocabulary modules to prevent:

- **String drift** - Mismatches between types and implementation
- **Magic constants** - Scattered string literals across files
- **Schema duplication** - Multiple definitions of the same data shape
- **Type mismatches** - Runtime errors from typos

---

## Structure

### `keywords.ts`

All string constants as `const` objects:

```typescript
export const intentKeywords = {
  gestures: {
    closedFist: 'Closed_Fist',
    openPalm: 'Open_Palm',
    // ...
  },
  hands: {
    left: 'left',
    right: 'right',
  },
  // ...
} as const
```

**Type exports** for TypeScript inference:

```typescript
export type GestureName = (typeof intentKeywords.gestures)[keyof typeof intentKeywords.gestures]
```

### `schemas.ts`

All Zod schemas referencing keywords:

```typescript
export const gesturePatternSchema = z.object({
  hand: z.enum([intentKeywords.hands.left, intentKeywords.hands.right]),
  gesture: z.enum([
    intentKeywords.gestures.closedFist,
    intentKeywords.gestures.openPalm,
    // ...
  ]),
})
```

**Type inference** from schemas:

```typescript
export type GesturePattern = z.infer<typeof gesturePatternSchema>
```

---

## Rules

### 1. No Magic Strings

❌ **Bad:**
```typescript
if (gesture === 'Open_Palm') {
  // What if we typo this?
}
```

✅ **Good:**
```typescript
import { intentKeywords } from './vocabulary'

if (gesture === intentKeywords.gestures.openPalm) {
  // Type-safe, autocomplete works
}
```

### 2. No Schema Duplication

❌ **Bad:**
```typescript
// In file A
const gestureSchema = z.object({ gesture: z.string() })

// In file B
const gestureSchema = z.object({ gesture: z.string() }) // Duplicate!
```

✅ **Good:**
```typescript
// In vocabulary/schemas.ts
export const gestureSchema = z.object({ gesture: z.string() })

// In file A
import { gestureSchema } from './vocabulary'

// In file B
import { gestureSchema } from './vocabulary'
```

### 3. Reference Keywords in Schemas

❌ **Bad:**
```typescript
const handSchema = z.enum(['left', 'right']) // Magic strings
```

✅ **Good:**
```typescript
const handSchema = z.enum([
  intentKeywords.hands.left,
  intentKeywords.hands.right,
])
```

### 4. Logical Slicing

Group related keywords together:

```typescript
export const intentKeywords = {
  // Gestures (from MediaPipe)
  gestures: { ... },
  
  // Hands
  hands: { ... },
  
  // Fingers
  fingers: { ... },
  
  // Action states
  actionStates: { ... },
}
```

### 5. Single Source of Truth

One file for all keywords per domain:

- `intent/vocabulary/keywords.ts` - Intent engine keywords
- `mediapipe/vocabulary/keywords.ts` - MediaPipe system keywords
- `detection/vocabulary/keywords.ts` - Detection worker keywords

---

## Usage Examples

### Defining an Intent

```typescript
import { defineIntent } from '@/lib/intent'
import { intentKeywords } from '@/lib/intent/vocabulary'

const drawIntent = defineIntent({
  id: 'draw',
  modifier: {
    hand: intentKeywords.hands.left,
    gesture: intentKeywords.gestures.openPalm,
  },
  action: {
    hand: intentKeywords.hands.right,
    contact: {
      type: intentKeywords.contactTypes.pinch,
      fingers: [
        intentKeywords.fingers.thumb,
        intentKeywords.fingers.index,
      ],
    },
  },
  // ...
})
```

### Matching Gestures

```typescript
import { matchesGesture } from '@/lib/intent'
import { intentKeywords } from '@/lib/intent/vocabulary'

const isOpenPalm = matchesGesture(frame, {
  hand: intentKeywords.hands.left,
  gesture: intentKeywords.gestures.openPalm,
})
```

### Action States

```typescript
import { intentKeywords } from '@/lib/intent/vocabulary'

if (action.state === intentKeywords.actionStates.active) {
  // Handle active action
}
```

---

## Benefits

### Type Safety

TypeScript can catch typos at compile time:

```typescript
// Typo caught by TypeScript
const gesture = intentKeywords.gestures.openPalm // ✅
const gesture = intentKeywords.gestures.openPalm // ❌ Error
```

### Autocomplete

IDE autocomplete works perfectly:

```typescript
intentKeywords.gestures. // Shows: closedFist, openPalm, etc.
```

### Refactoring

Change a constant once, updates everywhere:

```typescript
// Change in keywords.ts
gestures: {
  openPalm: 'Open_Palm_V2', // Update once
}

// All usages automatically updated
```

### Documentation

Keywords serve as documentation:

```typescript
export const intentKeywords = {
  gestures: {
    closedFist: 'Closed_Fist', // MediaPipe gesture name
    openPalm: 'Open_Palm',     // MediaPipe gesture name
    // ...
  },
}
```

---

## Migration Strategy

When adding new features:

1. **Define keywords first** - Add to `keywords.ts`
2. **Create schemas** - Reference keywords in `schemas.ts`
3. **Use in code** - Import from vocabulary
4. **Never use magic strings** - Always reference keywords

When refactoring existing code:

1. **Identify magic strings** - Search for string literals
2. **Add to keywords** - Define in vocabulary
3. **Replace usage** - Update code to use keywords
4. **Verify** - Run tests to ensure no breakage

---

## Canonical Detection Types

**New in Session 60:** The intent-engine now defines canonical detection types that all detection adapters must follow.

### Philosophy

Detection adapters (MediaPipe, TensorFlow, custom) transform their native types to our canonical format. This enables:

- **Pluggable detectors** - Swap MediaPipe for other backends
- **Type safety** - No MediaPipe types leak into public API
- **Clean architecture** - Adapter pattern with clear boundaries
- **Future-proof** - Easy to add new detector types

### Structure

Three new files define the canonical detection vocabulary:

#### `detectionKeywords.ts`

Detector types, handedness, gestures, landmarks, blendshapes:

```typescript
export const detectionKeywords = {
  detectorTypes: {
    hand: 'hand',
    face: 'face',
    body: 'body',    // future
    eye: 'eye',      // future
  },
  handedness: {
    left: 'left',
    right: 'right',
    unknown: 'unknown',
  },
  gestures: {
    closedFist: 'Closed_Fist',
    openPalm: 'Open_Palm',
    // ...
  },
  handLandmarks: {
    wrist: 0,
    thumbTip: 4,
    indexTip: 8,
    // ... 21 landmarks
  },
  faceBlendshapes: {
    neutral: '_neutral',
    eyeBlinkLeft: 'eyeBlinkLeft',
    mouthSmileLeft: 'mouthSmileLeft',
    // ... common blendshapes
  },
} as const
```

#### `detectionSchemas.ts`

Two-tier type system: Raw (adapter output) + Enriched (public API):

```typescript
// Raw types (what adapters produce)
export const rawHandDetectionSchema = z.object({
  handedness: z.enum(['left', 'right', 'unknown']),
  handednessScore: z.number(),
  gesture: z.string(),
  gestureScore: z.number(),
  landmarks: z.array(landmarkSchema).length(21),
  worldLandmarks: z.array(landmarkSchema).length(21),
})

// Enriched types (what public API exposes)
export const enrichedHandDetectionSchema = rawHandDetectionSchema.extend({
  handIndex: z.number().int().min(0).max(3),
  headIndex: z.number().int().min(0).max(1),
})

// Detection frame (pluggable detectors)
export const rawDetectionFrameSchema = z.object({
  timestamp: z.number(),
  detectors: z.object({
    hand: z.array(rawHandDetectionSchema).optional(),
    face: z.array(rawFaceDetectionSchema).optional(),
    // Future: body, eye, etc.
  }),
})
```

#### `detectionTypes.ts`

Clean type exports:

```typescript
export type {
  // Primitives
  Landmark,
  Category,
  TransformationMatrix,
  // Raw types (adapter output)
  RawHandDetection,
  RawFaceDetection,
  RawDetectionFrame,
  // Enriched types (public API)
  EnrichedHandDetection,
  EnrichedFaceDetection,
  EnrichedDetectionFrame,
} from './detectionSchemas'
```

### Two-Tier Architecture

**Raw Detection Types** (Adapter Output):
- Minimal structure adapters must produce
- No metadata, just detection data
- Stable contract for all adapters

**Enriched Detection Types** (Public API):
- Adds `handIndex`, `faceIndex`, `headIndex`
- Convenient for consumers
- Enrichment happens in frame history

### Usage Example

#### In Adapter (MediaPipe)

```typescript
import type { RawDetectionFrame } from '@handwave/intent-engine'
import type { GestureRecognizerResult } from '@mediapipe/tasks-vision'

function transformMediaPipeToCanonical(
  mpResult: GestureRecognizerResult,
  timestamp: number
): RawDetectionFrame {
  return {
    timestamp,
    detectors: {
      hand: transformHands(mpResult),
      // face: transformFaces(faceResult),
    },
  }
}
```

#### In Public API (Frame History)

```typescript
import { enrichDetectionFrame } from '@handwave/intent-engine'
import type { EnrichedDetectionFrame } from '@handwave/intent-engine'

// Transform Raw → Enriched
const enriched = enrichDetectionFrame(rawFrame)

// Consumers get EnrichedDetectionFrame
export function getLatestFrame(): EnrichedDetectionFrame {
  return enriched
}
```

#### In Consumer Code

```typescript
import type { EnrichedDetectionFrame } from '@handwave/intent-engine'

function processFrame(frame: EnrichedDetectionFrame) {
  frame.detectors.hand?.forEach(hand => {
    console.log(hand.handIndex)    // ✅ Has metadata
    console.log(hand.gesture)      // ✅ Canonical format
    console.log(hand.landmarks[8]) // ✅ Index finger tip
  })
}
```

### Benefits

**Pluggable Detectors:**
- MediaPipe is one implementation
- Easy to add TensorFlow.js adapter
- Easy to add custom ML models
- All follow same contract

**Type Safety:**
- No MediaPipe types in public API
- Compiler catches adapter errors
- Clean boundaries between layers

**Future-Proof:**
- Add new detectors without breaking changes
- Support multi-modal detection (hand + face + body)
- Enable/disable detectors dynamically

**Validation:**
- Zod schemas for import/export
- Runtime validation of adapter output
- Type-safe recording/playback

### Migration Path

**Phase 1 (Session 60):** ✅ Define canonical types  
**Phase 2 (Session 61):** Create MediaPipe adapter layer  
**Phase 3 (Session 61):** Update consumers to use canonical types  
**Phase 4 (Session 61):** Remove MediaPipe type leakage  

---

## Related Patterns

### MediaPipe Vocabulary

The MediaPipe package has its own vocabulary for worker communication:

- `packages/mediapipe/src/vocabulary/detectionKeywords.ts` - Worker task names
- `packages/mediapipe/src/vocabulary/detectionSchemas.ts` - Worker message schemas

**Note:** These are separate from the canonical detection types. The MediaPipe vocabulary is for worker communication, while the canonical types are for detection data.

### Intent Engine Vocabulary

The intent engine has its own vocabulary for pattern matching:

- `packages/intent-engine/src/vocabulary/keywords.ts` - Intent keywords
- `packages/intent-engine/src/vocabulary/schemas.ts` - Intent schemas

---

## Future: Global Vocabulary

Eventually, we may create a global vocabulary that unifies all subsystems:

```
src/core/lib/vocabulary/
├── keywords.ts       # Unified keywords (imports from subsystems)
├── schemas.ts        # Unified schemas (imports from subsystems)
└── index.ts          # Re-exports
```

This would allow cross-system references without coupling.

---

## Questions?

**Q: What if I need a one-off string?**  
A: If it's truly one-off and won't be reused, a string literal is fine. But if there's any chance it'll be used elsewhere, add it to keywords.

**Q: Should I add comments to keywords?**  
A: Yes! Document what each keyword means, especially if it maps to external APIs (like MediaPipe).

**Q: Can I have multiple vocabulary files?**  
A: Yes, for logical separation (e.g., gestures vs. commands). But keep related keywords together.

**Q: What about enums?**  
A: Prefer `const` objects with `as const` over enums. They're more flexible and work better with Zod.

---

**Status:** Pattern Established ✅  
**Usage:** Mandatory for all new code  
**Migration:** Ongoing for existing code

---

*"No magic strings, no drift, single source of truth."*


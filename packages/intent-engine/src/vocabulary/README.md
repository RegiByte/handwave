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

## Related Patterns

### MediaPipe Vocabulary

The MediaPipe system already uses this pattern:

- `src/core/lib/mediapipe/vocabulary/keywords.ts`
- `src/core/lib/mediapipe/vocabulary/schemas.ts`

### Detection Worker Vocabulary

The detection worker also uses this pattern:

- `src/core/lib/mediapipe/vocabulary/detectionKeywords.ts`
- `src/core/lib/mediapipe/vocabulary/detectionSchemas.ts`

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


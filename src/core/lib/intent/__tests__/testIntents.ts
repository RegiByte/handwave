/**
 * Test Intent Definitions
 *
 * Simple intents for testing the intent engine.
 */

import { defineIntent } from '@/core/lib/intent/dsl/defineIntent'
import { intentKeywords } from '@/core/lib/intent/vocabulary'

/**
 * Simple Victory Gesture Intent (for basic testing)
 *
 * Just detects Victory gesture on left hand - no modifier, no temporal constraints.
 * Use this to verify basic gesture detection works.
 */
export const simpleVictoryIntent = defineIntent({
  id: 'test:simple-victory',

  action: {
    type: intentKeywords.patternTypes.gesture,
    hand: intentKeywords.hands.left,
    gesture: intentKeywords.gestures.victory,
    // confidence: 0.5, // Lower threshold for testing
  },

  onStart: (ctx) => ({
    type: 'test:simple-victory:start',
    id: ctx.actionId,
    timestamp: ctx.timestamp,
    position: ctx.position,
    cell: ctx.cell,
    hand: ctx.hand,
    handIndex: ctx.handIndex,
  }),

  onUpdate: (ctx) => ({
    type: 'test:simple-victory:update',
    id: ctx.actionId,
    timestamp: ctx.timestamp,
    position: ctx.position,
    cell: ctx.cell,
    hand: ctx.hand,
    handIndex: ctx.handIndex,
    velocity: ctx.velocity,
    duration: ctx.duration,
  }),

  onEnd: (ctx) => ({
    type: 'test:simple-victory:end',
    id: ctx.actionId,
    timestamp: ctx.timestamp,
    position: ctx.position,
    cell: ctx.cell,
    hand: ctx.hand,
    handIndex: ctx.handIndex,
    reason: ctx.reason,
    duration: ctx.duration,
  }),
})

/**
 * Victory + Index Pinch Intent
 *
 * Modifier: Victory gesture on left hand
 * Action: Index finger pinch on right hand
 *
 * This is the easiest intent to test as both gestures have high confidence.
 */
export const victoryIndexPinchIntent = defineIntent({
  id: 'test:victory-index-pinch',

  modifier: {
    type: intentKeywords.patternTypes.gesture,
    hand: intentKeywords.hands.left,
    gesture: intentKeywords.gestures.victory,
    confidence: 0.7,
  },

  action: {
    type: intentKeywords.patternTypes.contact,
    hand: intentKeywords.hands.right,
    contactType: intentKeywords.contactTypes.pinch,
    fingers: [intentKeywords.fingers.index],
    threshold: 0.07,
  },

  temporal: {
    minDuration: 100, // Hold for 100ms before starting
  },

  onStart: (ctx) => ({
    type: 'test:victory-index-pinch:start',
    id: ctx.actionId,
    timestamp: ctx.timestamp,
    position: ctx.position,
    cell: ctx.cell,
    hand: ctx.hand,
    handIndex: ctx.handIndex,
  }),

  onUpdate: (ctx) => ({
    type: 'test:victory-index-pinch:update',
    id: ctx.actionId,
    timestamp: ctx.timestamp,
    position: ctx.position,
    cell: ctx.cell,
    hand: ctx.hand,
    handIndex: ctx.handIndex,
    velocity: ctx.velocity,
    duration: ctx.duration,
  }),

  onEnd: (ctx) => ({
    type: 'test:victory-index-pinch:end',
    id: ctx.actionId,
    timestamp: ctx.timestamp,
    position: ctx.position,
    cell: ctx.cell,
    hand: ctx.hand,
    handIndex: ctx.handIndex,
    reason: ctx.reason,
    duration: ctx.duration,
  }),
})


/**
 * Victory + Index Pinch Intent
 *
 * Modifier: Victory gesture on left hand
 * Action: Index finger pinch on right hand
 *
 * This is the easiest intent to test as both gestures have high confidence.
 */
export const victoryMiddlePinchIntent = defineIntent({
  id: 'test:victory-middle-pinch',

  modifier: {
    type: intentKeywords.patternTypes.gesture,
    hand: intentKeywords.hands.left,
    gesture: intentKeywords.gestures.victory,
    confidence: 0.7,
  },

  action: {
    type: intentKeywords.patternTypes.contact,
    hand: intentKeywords.hands.right,
    contactType: intentKeywords.contactTypes.pinch,
    fingers: [intentKeywords.fingers.middle],
    threshold: 0.07,
  },

  temporal: {
    minDuration: 100, // Hold for 100ms before starting
  },

  onStart: (ctx) => ({
    type: 'test:victory-middle-pinch:start',
    id: ctx.actionId,
    timestamp: ctx.timestamp,
    position: ctx.position,
    cell: ctx.cell,
    hand: ctx.hand,
    handIndex: ctx.handIndex,
  }),

  onUpdate: (ctx) => ({
    type: 'test:victory-middle-pinch:update',
    id: ctx.actionId,
    timestamp: ctx.timestamp,
    position: ctx.position,
    cell: ctx.cell,
    hand: ctx.hand,
    handIndex: ctx.handIndex,
    velocity: ctx.velocity,
    duration: ctx.duration,
  }),

  onEnd: (ctx) => ({
    type: 'test:victory-middle-pinch:end',
    id: ctx.actionId,
    timestamp: ctx.timestamp,
    position: ctx.position,
    cell: ctx.cell,
    hand: ctx.hand,
    handIndex: ctx.handIndex,
    reason: ctx.reason,
    duration: ctx.duration,
  }),
})

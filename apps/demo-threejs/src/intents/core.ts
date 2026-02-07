/**
 * Grab Intent
 *
 * Pinch-to-grab interaction for 3D objects.
 * Uses index finger pinch with any hand.
 */

import { bidirectional, intent, pinch } from '@handwave/intent-engine'

/**
 * Grab intent - pinch with index finger to grab objects
 *
 * Pattern: pinch('index') with any hand
 * - Uses calibrated threshold (0.06)
 * - Works with both hands simultaneously
 * - Quick response (50ms min duration)
 */
export const grabIntent = intent({
  id: 'grab:box',
  pattern: pinch('middle'), // Any hand, calibrated threshold (0.06)
  temporal: {
    minDuration: 100, // Quick response
    maxGap: 200
  },
})


/**
 * Resize intent - pinch with both hands with index finger to resize objects
 *
 * Pattern: bidirectional(pinch('index'), pinch('index'))
 * - Uses calibrated threshold (0.06)
 * - Works with both hands simultaneously
 * - Quick response (50ms min duration)
 */
export const resizeIntent = intent({
  id: 'grab:resize',
  pattern: bidirectional(pinch('index'), pinch('index')), // Any hand, calibrated threshold (0.06)
  temporal: {
    minDuration: 100, // Longer confirmation response
    maxGap: 50
  },
})

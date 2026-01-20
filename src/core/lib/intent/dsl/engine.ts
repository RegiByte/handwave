/**
 * Intent DSL v2 - Engine Adapter
 *
 * Bridges the new DSL with the existing intent engine.
 * Handles frame processing and event emission for v2 intents.
 */

import type {
  EndReason,
  EventCallback,
  GroupLimitConfig,
  Intent,
  IntentEventDescriptor,
  Position,
  StandardEndEvent,
  StandardStartEvent,
  StandardUpdateEvent,
  Unsubscribe,
} from './types'
import { extractAllMatchingHands, matchPatternExpr } from './matching'
import type {
  ActiveAction,
  FrameSnapshot,
  IntentEngineConfig,
  Vector3,
} from '@/core/lib/intent/core/types'
import { calculateVelocity } from '@/core/lib/intent/core/frameHistory'
import { normalizedToCell } from '@/core/lib/intent/spatial/grid'
import { intentKeywords } from '@/core/lib/intent/vocabulary'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Intent instance represents a specific hand performing an intent.
 * Used for conflict resolution at the per-hand level.
 */
type IntentInstance = {
  intent: Intent
  hand: 'left' | 'right'
  handIndex: number
  headIndex: number
  position: Position
  landmarks: Array<{ x: number; y: number; z: number }>
}

// ============================================================================
// ACTION ID GENERATION
// ============================================================================

let actionCounter = 0

function generateActionId(
  intentId: string,
  hand: string,
  handIndex: number,
  headIndex: number,
  timestamp: number
): string {
  return `${intentId}:${hand}:${handIndex}:${headIndex}:${timestamp}:${++actionCounter}`
}

// ============================================================================
// STANDARD EVENT GENERATION
// ============================================================================

/**
 * Generate a standard start event from action context.
 */
function generateStartEvent<TId extends string>(
  intentId: TId,
  action: ActiveAction
): StandardStartEvent<TId> {
  return {
    type: `${intentId}:start`,
    id: action.id,
    timestamp: action.context.timestamp,
    position: action.context.position,
    cell: action.context.cell,
    hand: action.context.hand,
    handIndex: action.context.handIndex,
    headIndex: action.context.headIndex,
  }
}

/**
 * Generate a standard update event from action context.
 */
function generateUpdateEvent<TId extends string>(
  intentId: TId,
  action: ActiveAction
): StandardUpdateEvent<TId> {
  return {
    type: `${intentId}:update`,
    id: action.id,
    timestamp: action.context.timestamp,
    position: action.context.position,
    cell: action.context.cell,
    hand: action.context.hand,
    handIndex: action.context.handIndex,
    headIndex: action.context.headIndex,
    velocity: action.context.velocity,
    duration: action.context.duration,
  }
}

/**
 * Generate a standard end event from action context.
 */
function generateEndEvent<TId extends string>(
  intentId: TId,
  action: ActiveAction,
  reason: EndReason
): StandardEndEvent<TId> {
  return {
    type: `${intentId}:end`,
    id: action.id,
    timestamp: action.context.timestamp,
    position: action.context.position,
    cell: action.context.cell,
    hand: action.context.hand,
    handIndex: action.context.handIndex,
    headIndex: action.context.headIndex,
    velocity: action.context.velocity,
    duration: action.context.duration,
    reason,
  }
}

// ============================================================================
// FRAME PROCESSING
// ============================================================================

/**
 * Process a frame for v2 intents.
 * Returns events to emit and updated actions.
 */
export function processFrameV2(
  frame: FrameSnapshot,
  history: Array<FrameSnapshot>,
  intents: Array<Intent>,
  activeActions: Map<string, ActiveAction>,
  config: ConflictResolutionConfig
): {
  events: Array<StandardStartEvent | StandardUpdateEvent | StandardEndEvent>
  actions: Map<string, ActiveAction>
} {
  const events: Array<StandardStartEvent | StandardUpdateEvent | StandardEndEvent> = []
  const updatedActions = new Map(activeActions)

  const gridConfig = config.spatial?.grid || { cols: 8, rows: 6 }

  // 1. Update existing active actions
  for (const [actionId, action] of Array.from(updatedActions.entries())) {
    const intentObj = intents.find((i) => i.id === action.intentId)
    if (!intentObj) {
      // Intent no longer exists, remove action
      updatedActions.delete(actionId)
      continue
    }

    const actionMatches = matchesIntentV2(intentObj, frame)
    const withinMaxGap =
      action.state === intentKeywords.actionStates.active &&
      !!intentObj.temporal?.maxGap &&
      frame.timestamp - action.lastUpdateTime <= intentObj.temporal.maxGap

    if (actionMatches) {
      // Continue action - update context for the SPECIFIC hand this action is tracking
      const allHands = extractAllMatchingHands(frame, intentObj.pattern)
      const handInfo = allHands.find(h =>
        h.hand === action.context.hand &&
        h.handIndex === action.context.handIndex
      )
      
      if (!handInfo) {
        // This specific hand lost the pattern - end action if not pending
        if (action.state === intentKeywords.actionStates.pending) {
          updatedActions.delete(actionId)
          continue
        }

        const reason = determineEndReason(action, intentObj, frame)
        events.push(generateEndEvent(intentObj.id, action, reason))
        updatedActions.delete(actionId)
        continue
      }

      const position = handInfo.position
      const cell = normalizedToCell(position, gridConfig)

      const previousFrame = history.length >= 2 ? history[history.length - 2] : null
      let velocity: Vector3 = { x: 0, y: 0, z: 0 }

      if (previousFrame) {
        const vel = calculateVelocity(frame, previousFrame, (f) => {
          // Track the SAME hand across frames
          const prevHands = extractAllMatchingHands(f, intentObj.pattern)
          const prevHand = prevHands.find(h =>
            h.hand === action.context.hand &&
            h.handIndex === action.context.handIndex
          )
          return prevHand ? prevHand.position : null
        })
        if (vel) velocity = vel
      }

      const updatedContext = {
        ...action.context,
        position,
        cell,
        velocity,
        timestamp: frame.timestamp,
        duration: frame.timestamp - action.startTime,
      }

      const updatedAction: ActiveAction = {
        ...action,
        lastUpdateTime: frame.timestamp,
        context: updatedContext,
      }

      // Check if pending action should activate
      if (
        updatedAction.state === intentKeywords.actionStates.pending &&
        intentObj.temporal?.minDuration !== undefined &&
        frame.timestamp - updatedAction.startTime >= intentObj.temporal.minDuration
      ) {
        const activatedAction: ActiveAction = {
          ...updatedAction,
          state: intentKeywords.actionStates.active as ActiveAction['state'],
        }
        updatedActions.set(actionId, activatedAction)
        if (intentObj.id === 'particles:clear') {
          console.log('[processFrameV2] Activating clear action (minDuration met) for hand:', activatedAction.context.hand, 'duration:', activatedAction.context.duration)
        }
        events.push(generateStartEvent(intentObj.id, activatedAction))
        continue
      }

      updatedActions.set(actionId, updatedAction)

      // Emit update event for active actions
      if (updatedAction.state === intentKeywords.actionStates.active) {
        const updateEvent = generateUpdateEvent(intentObj.id, updatedAction)
        if (intentObj.id === 'particles:clear') {
          console.log('[processFrameV2] Emitting clear update event for hand:', updatedAction.context.hand, 'duration:', updatedAction.context.duration)
        }
        events.push(updateEvent)
      }
      continue
    }

    // Pattern didn't match - check gap tolerance
    if (withinMaxGap) {
      updatedActions.set(actionId, action)
      continue
    }

    // Pending actions end silently
    if (action.state === intentKeywords.actionStates.pending) {
      updatedActions.delete(actionId)
      continue
    }

    // Active actions emit end event
    const reason = determineEndReason(action, intentObj, frame)
    if (intentObj.id === 'particles:clear') {
      console.log('[processFrameV2] Ending clear action for hand:', action.context.hand, 'reason:', reason)
    }
    events.push(generateEndEvent(intentObj.id, action, reason))
    updatedActions.delete(actionId)
  }

  // 2. Collect ALL intent instances (intent + hand combinations)
  const matchingInstances: Array<IntentInstance> = []
  const activeInstanceKeys = new Set<string>()

  for (const intentObj of intents) {
    const matchedNow = matchesIntentV2(intentObj, frame)

    if (matchedNow) {
      // console.log('[processFrameV2] Intent matched:', intentObj.id)
      // Extract ALL matching hands for this intent
      const matchingHands = extractAllMatchingHands(frame, intentObj.pattern)
      // console.log('[processFrameV2] Extracted', matchingHands.length, 'matching hands for', intentObj.id)
      
      for (const handInfo of matchingHands) {
        // console.log('[processFrameV2] Creating instance for:', intentObj.id, 'hand:', handInfo.hand, 'handIndex:', handInfo.handIndex, 'headIndex:', handInfo.headIndex)
        matchingInstances.push({
          intent: intentObj,
          hand: handInfo.hand,
          handIndex: handInfo.handIndex,
          headIndex: handInfo.headIndex,
          position: handInfo.position,
          landmarks: handInfo.landmarks,
        })

        // Track if this specific hand+intent is already active
        const isActive = isIntentActiveForHand(
          intentObj.id,
          handInfo.hand,
          handInfo.handIndex,
          updatedActions
        )
        if (isActive) {
          const key = `${intentObj.id}:${handInfo.hand}:${handInfo.handIndex}`
          activeInstanceKeys.add(key)
        }
      }
    }
  }

  // console.log('[processFrameV2] Total matching instances:', matchingInstances.length)

  // 3. Resolve conflicts at instance level (intent + hand)
  // console.log('[processFrameV2] Before conflict resolution. Matching instances:', matchingInstances.map(i => ({ id: i.intent.id, hand: i.hand, priority: i.intent.resolution?.priority ?? 0, group: i.intent.resolution?.group })))
  const selectedInstances = resolveConflictsV2(matchingInstances, config)
  // console.log('[processFrameV2] After conflict resolution. Selected instances:', selectedInstances.map(i => ({ id: i.intent.id, hand: i.hand })))
  const selectedInstanceKeys = new Set(
    selectedInstances.map(i => `${i.intent.id}:${i.hand}:${i.handIndex}`)
  )

  // 4. Cancel active instances that lost conflict resolution
  for (const [actionId, action] of Array.from(updatedActions.entries())) {
    const instanceKey = `${action.intentId}:${action.context.hand}:${action.context.handIndex}`
    
    // If this instance was matching but NOT selected, cancel it
    if (activeInstanceKeys.has(instanceKey) && !selectedInstanceKeys.has(instanceKey)) {
      // End the action
      if (action.state === intentKeywords.actionStates.active) {
        events.push(generateEndEvent(action.intentId, action, 'cancelled'))
      }
      updatedActions.delete(actionId)
    }
  }

  // 5. Start newly selected instances (skip if already active for this hand)
  for (const instance of selectedInstances) {
    // Skip if THIS specific hand is already performing this intent
    const alreadyActive = isIntentActiveForHand(
      instance.intent.id,
      instance.hand,
      instance.handIndex,
      updatedActions
    )
    
    if (alreadyActive) {
      // console.log('[processFrameV2] Skipping instance (already active):', instance.intent.id, 'hand:', instance.hand)
      continue
    }
    
    // console.log('[processFrameV2] Starting new instance:', instance.intent.id, 'hand:', instance.hand, 'position:', instance.position)

    const position = instance.position
    const cell = normalizedToCell(position, gridConfig)
    const velocity: Vector3 = { x: 0, y: 0, z: 0 }

    const actionId = generateActionId(
      instance.intent.id,
      instance.hand,
      instance.handIndex,
      instance.headIndex,
      frame.timestamp
    )

    const context = {
      actionId,
      intentId: instance.intent.id,
      hand: instance.hand,
      handIndex: instance.handIndex,
      headIndex: instance.headIndex,
      position,
      cell,
      velocity,
      timestamp: frame.timestamp,
      duration: 0,
    }

    const usesMinDuration = instance.intent.temporal?.minDuration !== undefined

    const newAction: ActiveAction = {
      id: actionId,
      intentId: instance.intent.id,
      state: usesMinDuration
        ? (intentKeywords.actionStates.pending as ActiveAction['state'])
        : (intentKeywords.actionStates.active as ActiveAction['state']),
      startTime: frame.timestamp,
      lastUpdateTime: frame.timestamp,
      context,
    }

    updatedActions.set(actionId, newAction)

    // Emit start event immediately if no minDuration
    if (!usesMinDuration) {
      const startEvent = generateStartEvent(instance.intent.id, newAction)
      // console.log('[processFrameV2] Emitting start event:', startEvent.type, 'for hand:', startEvent.hand, 'handIndex:', startEvent.handIndex)
      events.push(startEvent)
    }
  }

  // console.log('[processFrameV2] Frame processing complete. Total events:', events.length, 'Active actions:', updatedActions.size)
  return { events, actions: updatedActions }
}

// ============================================================================
// INTENT MATCHING
// ============================================================================

/**
 * Check if an intent matches the current frame.
 */
function matchesIntentV2(intentObj: Intent, frame: FrameSnapshot): boolean {
  // Simply match the pattern
  return matchPatternExpr(frame, intentObj.pattern)
}

// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================

/**
 * Extended config for conflict resolution.
 */
export interface ConflictResolutionConfig extends IntentEngineConfig {
  /** Global max concurrent intents */
  maxConcurrentIntents?: number
  /** Per-group limits and strategies */
  groupLimits?: Record<string, GroupLimitConfig>
  /** Custom resolver (overrides all other resolution) */
  customResolver?: (intents: Array<Intent>) => Array<Intent>
}

/**
 * Resolve conflicts between matching intents.
 * Groups intents by resolution group and selects based on priority/specificity.
 */
export function resolveConflicts(
  matchingIntents: Array<Intent>,
  config: ConflictResolutionConfig
): Array<Intent> {
  if (matchingIntents.length === 0) return []

  // Custom resolver takes precedence
  if (config.customResolver) {
    return config.customResolver(matchingIntents)
  }

  if (matchingIntents.length > 1) {
    console.log('resolvingConflicts', matchingIntents)
  }

  const maxConcurrent = config.maxConcurrentIntents ?? Infinity

  // Group by resolution group (undefined = global group)
  const groups = new Map<string | undefined, Array<Intent>>()
  for (const intent of matchingIntents) {
    const group = intent.resolution?.group
    if (!groups.has(group)) {
      groups.set(group, [])
    }
    groups.get(group)!.push(intent)
  }

  // Resolve each group independently
  const selected: Array<Intent> = []

  for (const [group, groupIntents] of groups) {
    const groupLimit = group ? config.groupLimits?.[group] : undefined
    const resolved = resolveGroup(groupIntents, groupLimit)
    selected.push(...resolved)
  }

  // Apply global max concurrent limit
  if (selected.length > maxConcurrent) {
    console.log('applying maxConcurrent limit', selected.length, maxConcurrent)
    return selected.slice(0, maxConcurrent)
  }

  console.log('selected', selected)

  return selected
}

/**
 * Resolve conflicts within a single group.
 * Sorts by priority (explicit) then specificity (automatic).
 * Applies group-specific limits and strategies.
 */
function resolveGroup(
  intents: Array<Intent>,
  groupLimit?: GroupLimitConfig
): Array<Intent> {
  if (intents.length === 0) return []
  if (intents.length === 1) return intents

  // Sort by priority (explicit) then specificity (automatic)
  const sorted = [...intents].sort((a, b) => {
    const aPriority = a.resolution?.priority ?? 0
    const bPriority = b.resolution?.priority ?? 0

    if (aPriority !== bPriority) {
      return bPriority - aPriority // Higher priority wins
    }

    // Same priority - use specificity
    const aSpecificity = a.resolution?._specificity ?? 0
    const bSpecificity = b.resolution?._specificity ?? 0

    return bSpecificity - aSpecificity // Higher specificity wins
  })

  // Apply group limit and strategy
  if (!groupLimit) {
    // No limit configured - return all intents
    return sorted
  }

  const strategy = groupLimit.strategy ?? 'winner-takes-all'
  const maxCount = groupLimit.max

  switch (strategy) {
    case 'winner-takes-all':
      // Return only the highest priority/specificity intent
      return [sorted[0]]

    case 'top-k':
      // Return top K intents by priority/specificity
      return sorted.slice(0, Math.min(maxCount, sorted.length))

    case 'custom':
      // Custom strategy would be handled by customResolver at top level
      // For now, fall back to top-k behavior
      return sorted.slice(0, Math.min(maxCount, sorted.length))

    default:
      return [sorted[0]]
  }
}

/**
 * Resolve conflicts for intent instances (intent + hand combinations).
 * This enables per-hand conflict resolution.
 */
function resolveConflictsV2(
  matchingInstances: Array<IntentInstance>,
  config: ConflictResolutionConfig
): Array<IntentInstance> {
  if (matchingInstances.length === 0) return []

  // Custom resolver takes precedence (convert instances to intents for legacy API)
  if (config.customResolver) {
    const intents = matchingInstances.map(i => i.intent)
    const selected = config.customResolver(intents)
    return matchingInstances.filter(i => selected.includes(i.intent))
  }

  // if (matchingInstances.length > 1) {
  //   console.log('resolving instance conflicts', matchingInstances.length, 'instances')
  // }

  const maxConcurrent = config.maxConcurrentIntents ?? Infinity

  // Group by resolution group AND hand (so same hand competing intents resolve separately per hand)
  const groups = new Map<string, Array<IntentInstance>>()
  for (const instance of matchingInstances) {
    const group = instance.intent.resolution?.group
    // Create a composite key: group:hand:handIndex
    // This ensures that intents compete PER HAND within their resolution group
    const groupKey = `${group ?? 'default'}:${instance.hand}:${instance.handIndex}`
    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(instance)
  }

  // Resolve each group independently
  const selected: Array<IntentInstance> = []

  for (const [groupKey, groupInstances] of groups) {
    // console.log('[resolveConflictsV2] Resolving group:', groupKey, 'with', groupInstances.length, 'instances')
    // Extract just the group name from the composite key (group:hand:handIndex)
    const groupName = groupKey.split(':')[0]
    const actualGroupName = groupName === 'default' ? undefined : groupName
    const groupLimit = actualGroupName ? config.groupLimits?.[actualGroupName] : undefined
    // console.log('[resolveConflictsV2] Group limit for', actualGroupName, ':', groupLimit)
    
    // For same-hand conflicts, always use winner-takes-all (highest priority wins)
    // This prevents simple spawn from activating when a higher-priority modifier spawn matches
    const perHandLimit = groupInstances.length > 1 ? { max: 1, strategy: 'winner-takes-all' as const } : groupLimit
    const resolved = resolveGroupInstances(groupInstances, perHandLimit)
    // console.log('[resolveConflictsV2] Resolved group', groupKey, 'to', resolved.length, 'instances')
    selected.push(...resolved)
  }

  // Apply global max concurrent limit
  if (selected.length > maxConcurrent) {
    // console.log('applying maxConcurrent limit', selected.length, maxConcurrent)
    return selected.slice(0, maxConcurrent)
  }

  // console.log('selected instances', selected.length)

  return selected
}

/**
 * Resolve conflicts within a single group for intent instances.
 * Sorts by priority then specificity.
 * Applies group-specific limits and strategies.
 */
function resolveGroupInstances(
  instances: Array<IntentInstance>,
  groupLimit?: GroupLimitConfig
): Array<IntentInstance> {
  if (instances.length === 0) return []
  if (instances.length === 1) return instances

  // Sort by priority then specificity
  const sorted = [...instances].sort((a, b) => {
    const aPriority = a.intent.resolution?.priority ?? 0
    const bPriority = b.intent.resolution?.priority ?? 0

    if (aPriority !== bPriority) {
      return bPriority - aPriority // Higher priority wins
    }

    // Same priority - use specificity
    const aSpec = a.intent.resolution?._specificity ?? 0
    const bSpec = b.intent.resolution?._specificity ?? 0

    return bSpec - aSpec // Higher specificity wins
  })

  // if (instances.length > 1) {
  //   console.log('[resolveGroupInstances] Resolving', instances.length, 'instances. Sorted by priority:', sorted.map(i => ({ id: i.intent.id, priority: i.intent.resolution?.priority ?? 0, specificity: i.intent.resolution?._specificity ?? 0 })))
  // }

  if (!groupLimit) {
    return sorted // No limit - return all
  }

  const strategy = groupLimit.strategy ?? 'winner-takes-all'
  const maxCount = groupLimit.max

  let result: Array<IntentInstance>
  switch (strategy) {
    case 'winner-takes-all':
      result = [sorted[0]]
      break
    case 'top-k':
      result = sorted.slice(0, Math.min(maxCount, sorted.length))
      break
    case 'custom':
      result = sorted.slice(0, Math.min(maxCount, sorted.length))
      break
    default:
      result = [sorted[0]]
  }

  // if (instances.length > 1) {
  //   console.log('[resolveGroupInstances] Selected', result.length, 'instances:', result.map(i => i.intent.id))
  // }

  return result
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function determineEndReason(
  action: ActiveAction,
  intentObj: Intent,
  frame: FrameSnapshot
): EndReason {
  if (
    intentObj.temporal?.maxGap &&
    frame.timestamp - action.lastUpdateTime > intentObj.temporal.maxGap
  ) {
    return 'timeout'
  }
  return 'completed'
}

/**
 * Check if a specific intent is active (any hand).
 * NOTE: Kept for backward compatibility. New code should use isIntentActiveForHand().
 */
function isIntentActive(
  intentId: string,
  activeActions: Map<string, ActiveAction>
): boolean {
  return Array.from(activeActions.values()).some(
    (action) => action.intentId === intentId
  )
}

/**
 * Check if a specific intent is active for a specific hand.
 * This enables per-hand action tracking for the same intent.
 */
function isIntentActiveForHand(
  intentId: string,
  hand: 'left' | 'right',
  handIndex: number,
  activeActions: Map<string, ActiveAction>
): boolean {
  return Array.from(activeActions.values()).some(
    (action) =>
      action.intentId === intentId &&
      action.context.hand === hand &&
      action.context.handIndex === handIndex
  )
}

// ============================================================================
// EVENT SUBSCRIPTION HELPERS
// ============================================================================

/**
 * Create a subscription manager for v2 intents.
 */
export function createSubscriptionManager() {
  const listeners = new Map<string, Set<EventCallback<any>>>()

  return {
    /**
     * Subscribe to events using a type-safe descriptor.
     */
    on<TEvent>(
      descriptor: IntentEventDescriptor<TEvent>,
      callback: EventCallback<TEvent>
    ): Unsubscribe {
      const type = descriptor.type
      if (!listeners.has(type)) {
        listeners.set(type, new Set())
      }
      listeners.get(type)!.add(callback)

      return () => {
        listeners.get(type)?.delete(callback)
      }
    },

    /**
     * Subscribe to all events.
     */
    onAny(callback: EventCallback<any>): Unsubscribe {
      const type = '*'
      if (!listeners.has(type)) {
        listeners.set(type, new Set())
      }
      listeners.get(type)!.add(callback)

      return () => {
        listeners.get(type)?.delete(callback)
      }
    },

    /**
     * Emit an event to all matching listeners.
     */
    emit(event: { type: string;[key: string]: any }) {
      // Emit to specific listeners
      const specificListeners = listeners.get(event.type)
      if (specificListeners) {
        for (const callback of specificListeners) {
          callback(event)
        }
      }

      // Emit to wildcard listeners
      const wildcardListeners = listeners.get('*')
      if (wildcardListeners) {
        for (const callback of wildcardListeners) {
          callback(event)
        }
      }

      // Also emit to intent-level listeners (e.g., 'particles:spawn' catches all phases)
      const intentId = event.type.split(':').slice(0, -1).join(':')
      if (intentId && intentId !== event.type) {
        const intentListeners = listeners.get(intentId)
        if (intentListeners) {
          for (const callback of intentListeners) {
            callback(event)
          }
        }
      }
    },

    /**
     * Clear all listeners.
     */
    clear() {
      listeners.clear()
    },
  }
}

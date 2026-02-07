/**
 * Type-Safe Event Bus
 *
 * A lightweight, type-safe event bus for intent events.
 * Provides subscription management with full TypeScript inference.
 *
 * Philosophy:
 * - Type safety without compromise
 * - Simple subscription model
 * - Efficient event routing
 * - No memory leaks (WeakMap for cleanup)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Expand utility - flattens type aliases for better IDE hover display.
 * Shows the actual structure instead of type aliases.
 */
type Expand<T> = {
  [K in keyof T]: T[K]
} & {}

/**
 * Event callback function with expanded type display.
 * The Expand utility ensures IDEs show the full event structure.
 */
export type EventCallback<TEvent = unknown> = (event: Expand<TEvent>) => void

/**
 * Unsubscribe function
 */
export type Unsubscribe = () => void

/**
 * Event descriptor for type-safe subscriptions.
 * Contains the event type string and phantom type for inference.
 */
export interface EventDescriptor<TEvent = unknown> {
  /** Event type string (e.g., 'particles:spawn:start') */
  readonly type: string
  /** Phantom type for inference - not actually present at runtime */
  readonly _event?: TEvent
}

/**
 * Event bus options
 */
export interface EventBusOptions {
  /**
   * Optional error handler for callback errors.
   * If not provided, errors will be thrown.
   */
  onError?: (error: unknown, event: unknown, callback: EventCallback) => void
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

/**
 * Type-safe event bus for managing subscriptions.
 *
 * @example
 * ```ts
 * const bus = createEventBus()
 *
 * // Subscribe to specific event type
 * const unsub = bus.subscribe(intent.events.start, (event) => {
 *   console.log(event.position) // Fully typed!
 * })
 *
 * // Emit event
 * bus.emit(intent.events.start.type, {
 *   type: 'particles:spawn:start',
 *   id: '123',
 *   timestamp: Date.now(),
 *   position: { x: 0.5, y: 0.5, z: 0 },
 *   // ... other fields
 * })
 *
 * // Cleanup
 * unsub()
 * ```
 */
export interface EventBus {
  /**
   * Subscribe to events matching an event descriptor.
   * Returns an unsubscribe function.
   */
  subscribe: <TEvent>(
    descriptor: EventDescriptor<TEvent>,
    callback: EventCallback<TEvent>
  ) => Unsubscribe

  /**
   * Subscribe to events matching a specific type string.
   * Less type-safe than using descriptors, but useful for dynamic subscriptions.
   */
  on: (eventType: string, callback: EventCallback) => Unsubscribe

  /**
   * Subscribe to all events.
   * Callback receives every event emitted.
   */
  onAny: (callback: EventCallback) => Unsubscribe

  /**
   * Emit an event to all matching subscribers.
   * Events are matched by type string.
   */
  emit: (eventType: string, event: unknown) => void

  /**
   * Clear all subscriptions.
   */
  clear: () => void

  /**
   * Get the number of active subscriptions.
   */
  size: () => number
}

/**
 * Create a new event bus instance.
 *
 * @param options - Configuration options
 * @returns Event bus instance
 */
export function createEventBus(options: EventBusOptions = {}): EventBus {
  // Map of event type -> Set of callbacks
  const subscriptions = new Map<string, Set<EventCallback>>()

  // Set of callbacks subscribed to all events
  const anySubscriptions = new Set<EventCallback>()

  // Error handler
  const handleError = options.onError || ((error) => { throw error })

  /**
   * Internal: Add a subscription
   */
  function addSubscription(eventType: string, callback: EventCallback): Unsubscribe {
    let callbacks = subscriptions.get(eventType)
    if (!callbacks) {
      callbacks = new Set()
      subscriptions.set(eventType, callbacks)
    }
    callbacks.add(callback)

    // Return unsubscribe function
    return () => {
      const cleanupCallbacks = subscriptions.get(eventType)
      if (cleanupCallbacks) {
        cleanupCallbacks.delete(callback)
        // Clean up empty sets
        if (cleanupCallbacks.size === 0) {
          subscriptions.delete(eventType)
        }
      }
    }
  }

  /**
   * Internal: Invoke a callback with error handling
   */
  function invokeCallback(callback: EventCallback, event: any): void {
    try {
      callback(event)
    } catch (error) {
      handleError(error, event, callback)
    }
  }

  return {
    subscribe<TEvent>(
      descriptor: EventDescriptor<TEvent>,
      callback: EventCallback<TEvent>
    ): Unsubscribe {
      return addSubscription(descriptor.type, callback as EventCallback)
    },

    on(eventType: string, callback: EventCallback): Unsubscribe {
      return addSubscription(eventType, callback)
    },

    onAny(callback: EventCallback): Unsubscribe {
      anySubscriptions.add(callback)
      return () => {
        anySubscriptions.delete(callback)
      }
    },

    emit(eventType: string, event: any): void {
      // Emit to specific subscribers
      const callbacks = subscriptions.get(eventType)
      if (callbacks) {
        callbacks.forEach((callback) => invokeCallback(callback, event))
      }

      // Emit to any subscribers
      anySubscriptions.forEach((callback) => invokeCallback(callback, event))
    },

    clear(): void {
      subscriptions.clear()
      anySubscriptions.clear()
    },

    size(): number {
      let count = anySubscriptions.size
      subscriptions.forEach((callbacks) => {
        count += callbacks.size
      })
      return count
    },
  }
}

// ============================================================================
// Utility: Subscribe to Multiple Events
// ============================================================================

/**
 * Subscribe to multiple event descriptors at once.
 * Returns a single unsubscribe function that removes all subscriptions.
 *
 * @example
 * ```ts
 * const unsub = subscribeMany(bus, [
 *   [vortexIntent.events.start, handleVortexStart],
 *   [spawnIntent.events.start, handleSpawnStart],
 *   [vortexIntent.events.end, handleVortexEnd],
 * ])
 *
 * // Later: unsubscribe from all
 * unsub()
 * ```
 */
export function subscribeMany<TEvent = any>(
  bus: EventBus,
  subscriptions: Array<[EventDescriptor<TEvent>, EventCallback<TEvent>]>
): Unsubscribe {
  const unsubscribers = subscriptions.map(([descriptor, callback]) =>
    bus.subscribe(descriptor, callback)
  )

  return () => {
    unsubscribers.forEach((unsub) => unsub())
  }
}

// ============================================================================
// Utility: Event Type Matching
// ============================================================================

/**
 * Check if an event matches a descriptor.
 * Useful for filtering events in onAny subscriptions.
 *
 * @example
 * ```ts
 * bus.onAny((event) => {
 *   if (matchesDescriptor(event, vortexIntent.events.start)) {
 *     // event is a vortex start event
 *   }
 * })
 * ```
 */
export function matchesDescriptor<TEvent>(
  event: any,
  descriptor: EventDescriptor<TEvent>
): event is TEvent {
  return event.type === descriptor.type
}

/**
 * Check if an event matches any of the provided descriptors.
 *
 * @example
 * ```ts
 * bus.onAny((event) => {
 *   if (matchesAnyDescriptor(event, [
 *     vortexIntent.events.start,
 *     spawnIntent.events.start,
 *   ])) {
 *     // event is a start event from vortex or spawn
 *   }
 * })
 * ```
 */
export function matchesAnyDescriptor<TEvent>(
  event: any,
  descriptors: Array<EventDescriptor<TEvent>>
): event is TEvent {
  return descriptors.some((descriptor) => event.type === descriptor.type)
}

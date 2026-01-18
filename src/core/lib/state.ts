import { useRef, useState, useSyncExternalStore } from 'react'

/**
 * Create a subscription object with a payload
 * @param payload - The payload to subscribe to
 * @returns A subscription object
 */
export function createSubscription<TPayload>() {
  const subscribers = new Set<(payload: TPayload) => void>()

  return {
    subscribe: (callback: (payload: TPayload) => void): (() => void) => {
      subscribers.add(callback)
      return () => subscribers.delete(callback)
    },
    notify: (payload: TPayload) => {
      subscribers.forEach((callback) => callback(payload))
    },
    clear: () => {
      subscribers.clear()
    },
    size: () => {
      return subscribers.size
    },
  }
}

export type Subscription<TPayload> = ReturnType<
  typeof createSubscription<TPayload>
>

export type SubscriptionCallback<T extends Subscription<any>> = Parameters<
  T['subscribe']
>[0]

/**
 * Create a lightweight state atom with subscriptions
 *
 */
export function createAtom<T>(initialState: T) {
  let state = initialState
  const stateSubscription = createSubscription<T>()

  const api = {
    get: () => state,
    update: (updater: (state: T) => T) => {
      state = updater(state)
      stateSubscription.notify(state)
    },
    set: (newState: T) => {
      state = newState
      stateSubscription.notify(state)
    },
    mutate: (mutator: (state: T) => void) => {
      mutator(state)
      stateSubscription.notify(state)
    },
    subscribe: (callback: (state: T) => void): (() => void) => {
      return stateSubscription.subscribe(callback)
    },
  }

  return api
}

export function useAtomState<T extends Atom<any>>(atom: T) {
  return useSyncExternalStore(atom.subscribe, atom.get, () => atom.get())
}

export type Atom<T> = ReturnType<typeof createAtom<T>>
export type AtomState<T extends Atom<any>> = ReturnType<T['get']>

export function useRefState<T>(initialState: T) {
  const ref = useRef<T>(initialState)
  const [state, setEffectiveState] = useState<T>(initialState)
  const setState = (updater: (state: T) => T) => {
    const updatedState = updater(ref.current)
    ref.current = updatedState
    setEffectiveState(updatedState)
  }
  return [state, setState, ref] as const
}

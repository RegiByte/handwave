/**
 * Shortcuts Resource
 *
 * Keyboard shortcut system that depends only on runtime.
 * Handles keyboard events and dispatches commands to runtime.
 *
 * Reference implementation from simulation-shortcuts/shortcuts.ts
 */

import { throttle } from '@tanstack/pacer'
import { defineResource } from 'braided'
import type { RuntimeAPI } from './runtime'

// ============================================================================
// Types
// ============================================================================

const shortcutModifiers = {
  shift: 'shift',
  ctrl: 'ctrl',
  meta: 'meta',
  alt: 'alt',
} as const

type Modifiers = keyof typeof shortcutModifiers

type Keymap =
  | `${Modifiers}+${string}`
  | `${Modifiers}+${Modifiers}+${string}`
  | string

type Shortcut = {
  keymaps: Array<Keymap>
  handler: (event: KeyboardEvent) => void
}

type EvaluatedKeymap = {
  key: string
  shift: boolean
  ctrl: boolean
  meta: boolean
  alt: boolean
}

// ============================================================================
// Keymap Evaluation
// ============================================================================

const isSpace = (key: string) => {
  return key === ' ' || key === 'Space'
}

const spaceOrKey = (key: string) => {
  return isSpace(key) ? 'space' : key
}

const evaluateKeymap = (keymap: string): EvaluatedKeymap | null => {
  const tokens = keymap.split('+')
  const modifiers = tokens.filter(
    (key) => shortcutModifiers[key as keyof typeof shortcutModifiers],
  )
  const keys = tokens.filter(
    (key) => !shortcutModifiers[key as keyof typeof shortcutModifiers],
  )

  if (keys.length === 0) {
    console.warn(
      `[Shortcuts] Invalid keymap: ${keymap} - Expected at least one key`,
    )
    return null
  }

  if (keys.length !== tokens.length - modifiers.length) {
    console.warn(
      `[Shortcuts] Invalid keymap: ${keymap} - Expected only one key`,
    )
    return null
  }

  return {
    key: spaceOrKey(keys[0]),
    shift: modifiers.includes('shift'),
    ctrl: modifiers.includes('ctrl'),
    meta: modifiers.includes('meta'),
    alt: modifiers.includes('alt'),
  }
}

// ============================================================================
// Resource Definition
// ============================================================================

export const shortcutsResource = defineResource({
  dependencies: ['runtime'],
  start: ({ runtime }: { runtime: RuntimeAPI }) => {
    // ========================================================================
    // Command Definitions
    // ========================================================================

    const commands = {
      togglePause: () => {
        console.log('[Shortcuts] Toggling pause')
        runtime.commands.togglePause()
      },
      toggleMirror: () => {
        console.log('[Shortcuts] Toggling mirror')
        runtime.commands.toggleMirror()
      },
      toggleDebugMode: () => {
        console.log('[Shortcuts] Toggling debug mode')
        runtime.commands.toggleDebugMode()
      },
      toggleVideoForeground: () => {
        console.log('[Shortcuts] Toggling video foreground')
        runtime.commands.toggleVideoForeground()
      },
    }

    // ========================================================================
    // Throttled Commands (prevent spam)
    // ========================================================================

    const throttledCommands = {
      togglePause: throttle(commands.togglePause, { wait: 100 }),
      toggleMirror: throttle(commands.toggleMirror, { wait: 100 }),
      toggleDebugMode: throttle(commands.toggleDebugMode, { wait: 100 }),
      toggleVideoForeground: throttle(commands.toggleVideoForeground, {
        wait: 100,
      }),
    }

    // ========================================================================
    // Shortcut Definitions
    // ========================================================================

    const shortcuts: Array<Shortcut> = [
      {
        keymaps: ['space'],
        handler: () => throttledCommands.togglePause(),
      },
      {
        keymaps: ['m'],
        handler: () => throttledCommands.toggleMirror(),
      },
      {
        keymaps: ['d', 'shift+d'],
        handler: () => throttledCommands.toggleDebugMode(),
      },
      {
        keymaps: ['v'],
        handler: () => throttledCommands.toggleVideoForeground(),
      },
    ]

    // ========================================================================
    // Keyboard Event Handler
    // ========================================================================

    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const matchedShortcut = shortcuts.find((shortcut) => {
        return shortcut.keymaps.some((keymap) => {
          const result = evaluateKeymap(keymap)
          if (!result) {
            return false
          }

          const { key, shift, ctrl, meta, alt } = result
          return (
            key.toLowerCase() === spaceOrKey(event.key).toLowerCase() &&
            shift === event.shiftKey &&
            ctrl === event.ctrlKey &&
            meta === event.metaKey &&
            alt === event.altKey
          )
        })
      })

      if (matchedShortcut) {
        event.preventDefault()
        event.stopPropagation()
        matchedShortcut.handler(event)
      }
    }

    // ========================================================================
    // Initialization
    // ========================================================================

    console.log('[Shortcuts] Initializing')
    document.addEventListener('keydown', handleKeyPress)

    // ========================================================================
    // API
    // ========================================================================

    const api = {
      cleanup: () => {
        console.log('[Shortcuts] Cleaning up')
        document.removeEventListener('keydown', handleKeyPress)
      },
    }

    return api
  },
  halt: ({ cleanup }) => {
    cleanup()
  },
})

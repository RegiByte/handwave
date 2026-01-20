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
import type { GridResolution } from '@/core/lib/intent/core/types'

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
      toggleGridOverlay: () => {
        console.log('[Shortcuts] Toggling grid overlay')
        runtime.commands.toggleGridOverlay()
      },
      setGridResolution: (resolution: GridResolution | 'all') => {
        console.log('[Shortcuts] Setting grid resolution:', resolution)
        runtime.commands.setGridResolution(resolution)
      },
      toggleVideoForeground: () => {
        console.log('[Shortcuts] Toggling video foreground')
        runtime.commands.toggleVideoForeground()
      },
      toggleParticles: () => {
        console.log('[Shortcuts] Toggling particles')
        runtime.commands.toggleParticles()
      },
    }

    // ========================================================================
    // Throttled Commands (prevent spam)
    // ========================================================================
    let schedulePauseTimeout: NodeJS.Timeout | null = null
    const throttledCommands = {
      togglePause: throttle(commands.togglePause, { wait: 100 }),
      toggleMirror: throttle(commands.toggleMirror, { wait: 100 }),
      toggleDebugMode: throttle(commands.toggleDebugMode, { wait: 100 }),
      toggleGridOverlay: throttle(commands.toggleGridOverlay, { wait: 100 }),
      setGridResolution: throttle(commands.setGridResolution, { wait: 100 }),
      toggleVideoForeground: throttle(commands.toggleVideoForeground, {
        wait: 100,
      }),
      toggleParticles: throttle(commands.toggleParticles, { wait: 100 }),
      schedulePause: throttle(() => {
        if (schedulePauseTimeout) {
          clearTimeout(schedulePauseTimeout)
        }
        schedulePauseTimeout = setTimeout(() => {
          commands.togglePause()
        }, 3000)
      }, { wait: 100 }),
    }

    // ========================================================================
    // Shortcut Definitions
    // ========================================================================

    const shortcuts: Array<Shortcut> = [
      {
        keymaps: ['shift+space'],
        handler: () => throttledCommands.schedulePause(),
      },
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
        keymaps: ['g'],
        handler: () => throttledCommands.toggleGridOverlay(),
      },
      {
        keymaps: ['1'],
        handler: () => throttledCommands.setGridResolution('coarse'),
      },
      {
        keymaps: ['2'],
        handler: () => throttledCommands.setGridResolution('medium'),
      },
      {
        keymaps: ['3'],
        handler: () => throttledCommands.setGridResolution('fine'),
      },
      {
        keymaps: ['4'],
        handler: () => throttledCommands.setGridResolution('all'),
      },
      {
        keymaps: ['v'],
        handler: () => throttledCommands.toggleVideoForeground(),
      },
      {
        keymaps: ['p'],
        handler: () => throttledCommands.toggleParticles(),
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
      console.log('matchedShortcut', matchedShortcut)

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

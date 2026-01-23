import { defineResource } from 'braided'
import { DrawingUtils } from '@mediapipe/tasks-vision'
import { useEffect } from 'react'
import { Debouncer } from '@tanstack/react-pacer'

export type CanvasConfig = {
  width?: number
  height?: number
  className?: string
}

export type CanvasAPI = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  drawer: DrawingUtils
  width: number
  height: number
  resize: (newWidth: number, newHeight: number) => void
  clear: () => void
  /**
   * React hook to mount the canvas into a container ref
   * Optionally enables auto-resize to match container dimensions
   */
  useContainer: (
    containerRef: React.RefObject<HTMLDivElement | null>,
    options?: { autoResize?: boolean },
  ) => void
}

export const createCanvasResource = (config: CanvasConfig = {}) =>
  defineResource({
    dependencies: [],
    start: () => {
      const { width = 800, height = 600, className = '' } = config

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.objectFit = 'contain'

      if (className) {
        canvas.className = className
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        throw new Error('Failed to get 2D context from canvas')
      }

      const drawer = new DrawingUtils(ctx)

      const api: CanvasAPI = {
        canvas,
        ctx,
        drawer,
        width: canvas.width,
        height: canvas.height,

        resize: (newWidth: number, newHeight: number) => {
          canvas.width = newWidth
          canvas.height = newHeight
          // Keep style at 100% for responsive sizing
          api.width = newWidth
          api.height = newHeight
        },

        clear: () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        },

        useContainer: (
          containerRef: React.RefObject<HTMLDivElement | null>,
          options: { autoResize?: boolean } = {},
        ) => {
          useEffect(() => {
            const container = containerRef.current
            if (!container) return

            // Check if canvas is already in this container
            if (!container.contains(canvas)) {
              container.appendChild(canvas)
            }

            // Auto-resize handler
            let resizeObserver: ResizeObserver | null = null
            const handleResize = () => {
              const rect = container.getBoundingClientRect()
              const newWidth = Math.floor(rect.width)
              const newHeight = Math.floor(rect.height)

              if (newWidth > 0 && newHeight > 0) {
                api.resize(newWidth, newHeight)
              }
            }
            const debouncedHandleSize = new Debouncer(handleResize, {
              wait: 150,
            })

            if (options.autoResize) {
              // Initial resize
              handleResize()

              // Watch for container size changes
              resizeObserver = new ResizeObserver(() =>
                debouncedHandleSize.maybeExecute(),
              )
              resizeObserver.observe(container)
            }

            return () => {
              if (resizeObserver) {
                resizeObserver.disconnect()
              }
              if (container.contains(canvas)) {
                container.removeChild(canvas)
              }
              debouncedHandleSize.cancel()
            }
          }, [containerRef, options.autoResize])
        },
      }

      return api
    },
    halt: ({ canvas }) => {
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas)
      }
    },
  })

// Default canvas resource
export const canvasResource = createCanvasResource()

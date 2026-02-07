/**
 * Debug utilities for Three.js demo
 * 
 * Run in browser console to inspect system state
 */

// Expose system to window for debugging
export function exposeSystemDebug(system: any) {
  if (typeof window !== 'undefined') {
    (window as any).__handwave_system = system
    (window as any).__handwave_debug = {
      checkCamera: () => {
        const camera = system?.camera
        if (!camera) {
          console.error('Camera resource not found')
          return
        }
        
        console.log('[Debug] Camera state:', {
          status: camera.state?.get(),
          video: {
            srcObject: !!camera.video?.srcObject,
            videoWidth: camera.video?.videoWidth,
            videoHeight: camera.video?.videoHeight,
            readyState: camera.video?.readyState,
            paused: camera.video?.paused,
            muted: camera.video?.muted,
          },
          stream: {
            active: camera.stream?.active,
            tracks: camera.stream?.getTracks().map((t: MediaStreamTrack) => ({
              kind: t.kind,
              label: t.label,
              enabled: t.enabled,
              readyState: t.readyState,
            })),
          },
        })
      },
      
      checkLoop: () => {
        const loop = system?.loop
        if (!loop) {
          console.error('Loop resource not found')
          return
        }
        
        console.log('[Debug] Loop state:', {
          state: loop.state?.get(),
          isRunning: loop.isRunning?.(),
        })
      },
      
      checkWorker: () => {
        const worker = system?.detectionWorker
        if (!worker) {
          console.error('Detection worker not found')
          return
        }
        
        console.log('[Debug] Worker state:', {
          initialized: worker.isInitialized(),
          sharedBufferEnabled: worker.isSharedBufferEnabled(),
        })
      },
      
      checkAll: () => {
        console.log('[Debug] Full system check:')
        ;(window as any).__handwave_debug.checkCamera()
        ;(window as any).__handwave_debug.checkLoop()
        ;(window as any).__handwave_debug.checkWorker()
      },
    }
    
    console.log('[Debug] System exposed to window.__handwave_system')
    console.log('[Debug] Run window.__handwave_debug.checkAll() to inspect')
  }
}

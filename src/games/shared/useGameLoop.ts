import { useCallback, useEffect, useRef } from 'react'

/** Clamp for long frames (tab switch, GC pause) so nothing skips a collision. */
const MAX_STEP_SECONDS = 1 / 30

/**
 * requestAnimationFrame loop with delta time in seconds. `tick` returns true
 * to keep running, false to stop. Stops automatically on unmount.
 */
export function useGameLoop(tick: (dt: number) => boolean) {
  const tickRef = useRef(tick)
  const frameRef = useRef<number | null>(null)
  const lastRef = useRef(0)

  useEffect(() => {
    tickRef.current = tick
  })

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (frameRef.current !== null)
      return
    lastRef.current = performance.now()

    function loop(now: number) {
      const dt = Math.min(Math.max(0, (now - lastRef.current) / 1000), MAX_STEP_SECONDS)
      lastRef.current = now
      frameRef.current = null
      if (tickRef.current(dt) && frameRef.current === null)
        frameRef.current = requestAnimationFrame(loop)
    }
    frameRef.current = requestAnimationFrame(loop)
  }, [])

  useEffect(() => stop, [stop])

  return { start, stop }
}

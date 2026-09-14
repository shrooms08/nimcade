import { useEffect, useRef } from 'react'

/**
 * Nothing that starts inside the play surface may scroll the feed. Pair the
 * returned ref with `touch-action: none` (the `.game-surface` class). These are
 * native listeners because React's are passive and cannot cancel scrolling.
 */
export function usePlaySurface<T extends HTMLElement = HTMLDivElement>() {
  const surfaceRef = useRef<T | null>(null)

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface)
      return

    const stop = (event: TouchEvent) => event.stopPropagation()
    const block = (event: TouchEvent) => {
      event.stopPropagation()
      if (event.cancelable)
        event.preventDefault()
    }
    surface.addEventListener('touchstart', stop, { passive: true })
    surface.addEventListener('touchmove', block, { passive: false })
    surface.addEventListener('touchend', stop, { passive: true })
    return () => {
      surface.removeEventListener('touchstart', stop)
      surface.removeEventListener('touchmove', block)
      surface.removeEventListener('touchend', stop)
    }
  }, [])

  return surfaceRef
}

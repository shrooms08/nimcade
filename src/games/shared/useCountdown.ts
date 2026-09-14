import { useCallback, useMemo, useRef } from 'react'
import { ROUND_SECONDS, URGENT_SECONDS } from './effects'

/**
 * Drives the big countdown by ref, so the text changes without re-rendering
 * every frame. Turns red in the last URGENT_SECONDS and flashes on 3, 2, 1.
 */
export function useCountdown() {
  const countdownRef = useRef<HTMLSpanElement | null>(null)

  /** Returns true on the frame a 3-2-1 flash fires. */
  const update = useCallback((timeLeft: number, running: boolean): boolean => {
    const element = countdownRef.current
    if (!element)
      return false

    let flashed = false
    const shown = Math.ceil(timeLeft)
    if (element.textContent !== String(shown)) {
      if (running && shown <= URGENT_SECONDS && shown > 0) {
        element.classList.remove('is-flash')
        void element.offsetWidth // restart the CSS animation
        element.classList.add('is-flash')
        flashed = true
      }
      element.textContent = String(shown)
    }
    element.classList.toggle('is-urgent', running && timeLeft <= URGENT_SECONDS)
    return flashed
  }, [])

  const reset = useCallback(() => {
    const element = countdownRef.current
    if (!element)
      return
    element.classList.remove('is-flash', 'is-urgent')
    element.textContent = String(ROUND_SECONDS)
  }, [])

  // Memoised so games can list it as an effect dependency without re-running
  // (and resetting the round) on every render.
  return useMemo(() => ({ countdownRef, update, reset }), [update, reset])
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** A value that clears itself after a delay: hints, toasts, the tip-success card. */
export function useTransient<T>() {
  const [value, setValue] = useState<T | null>(null)
  const timer = useRef<number | null>(null)

  const stopTimer = () => {
    if (timer.current !== null)
      window.clearTimeout(timer.current)
    timer.current = null
  }

  const show = useCallback((next: T, ms: number) => {
    stopTimer()
    setValue(next)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setValue(null)
    }, ms)
  }, [])

  const clear = useCallback(() => {
    stopTimer()
    setValue(null)
  }, [])

  useEffect(() => stopTimer, [])

  return useMemo(() => ({ value, show, clear }), [value, show, clear])
}

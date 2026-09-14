import { useEffect, useState } from 'react'
import { Wordmark } from './brand/Wordmark'

/** Never longer than this. */
const MAX_MS = 1500
/** Never shorter than this, so a fast load doesn't flash the splash. */
const MIN_MS = 500
const FADE_MS = 250

/** White dotted grid, the wordmark and "inside Nimiq Pay"; leaves once the first card is ready (or at 1.5s). */
export function Splash({ ready }: { ready: boolean }) {
  const [shownAt] = useState(() => Date.now())
  const [phase, setPhase] = useState<'shown' | 'leaving' | 'gone'>('shown')

  useEffect(() => {
    if (phase !== 'shown')
      return
    const elapsed = Date.now() - shownAt
    const wait = ready ? Math.max(0, MIN_MS - elapsed) : Math.max(0, MAX_MS - elapsed)
    const timer = window.setTimeout(() => setPhase('leaving'), wait)
    return () => window.clearTimeout(timer)
  }, [phase, ready, shownAt])

  useEffect(() => {
    if (phase !== 'leaving')
      return
    const timer = window.setTimeout(() => setPhase('gone'), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'gone')
    return null
  return (
    <div className={phase === 'leaving' ? 'nc-splash is-leaving' : 'nc-splash'} aria-hidden={phase === 'leaving'}>
      <Wordmark size={44} tone="dark" />
      <span className="nc-splash__line">inside Nimiq Pay</span>
    </div>
  )
}

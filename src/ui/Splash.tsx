import { useEffect, useState } from 'react'
import { NimcadeIcon } from './brand/NimcadeIcon'
import { Wordmark } from './brand/Wordmark'

/** The intro animation (splash.css) settles at 1s; the exit takes 200ms, or 300ms as a plain fade with reduced motion. */
const INTRO_MS = 1000
const EXIT_MS = 200
const REDUCED_EXIT_MS = 300
/** A slow first card holds the settled splash, but never past this in total. */
const MAX_TOTAL_MS = 2000

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Startup animation over the already-mounted feed: white dotted grid, the icon,
 * the wordmark, then a fade to black. Leaves once the first card is ready: 1.2s
 * at the earliest, 2s at the latest. It never waits for lazily loaded chunks.
 */
export function Splash({ ready }: { ready: boolean }) {
  const [shownAt] = useState(() => performance.now())
  const [exitMs] = useState(() => (prefersReducedMotion() ? REDUCED_EXIT_MS : EXIT_MS))
  const [phase, setPhase] = useState<'intro' | 'leaving' | 'gone'>('intro')

  useEffect(() => {
    if (phase !== 'intro')
      return
    const leaveAt = ready ? INTRO_MS + EXIT_MS - exitMs : MAX_TOTAL_MS - exitMs
    const timer = window.setTimeout(() => setPhase('leaving'), Math.max(0, leaveAt - (performance.now() - shownAt)))
    return () => window.clearTimeout(timer)
  }, [exitMs, phase, ready, shownAt])

  useEffect(() => {
    if (phase !== 'leaving')
      return
    const timer = window.setTimeout(() => setPhase('gone'), exitMs)
    return () => window.clearTimeout(timer)
  }, [exitMs, phase])

  if (phase === 'gone')
    return null
  return (
    <div className={phase === 'leaving' ? 'nc-splash is-leaving' : 'nc-splash'} role="status" aria-label="Nimcade, inside Nimiq Pay">
      <div className="nc-splash__grid" />
      <div className="nc-splash__stack" aria-hidden="true">
        <NimcadeIcon className="nc-splash__icon" squareClassName="nc-splash__square" letterClassName="nc-splash__n" />
        <Wordmark tone="black" height={30} className="nc-splash__wordmark" />
        <span className="nc-splash__line">inside Nimiq Pay</span>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnimationEvent, CSSProperties } from 'react'
import { games } from '../games/registry'
import { NimcadeIcon } from './brand/NimcadeIcon'
import { Wordmark } from './brand/Wordmark'
import { getCover } from './covers'

/** splash.css settles the sequence by 2.6s; the exit takes 400ms, or 300ms as a plain fade with reduced motion. */
const INTRO_MS = 2600
const EXIT_MS = 400
const REDUCED_EXIT_MS = 300
/** A slow first card holds the settled splash, but never past this in total. */
const MAX_TOTAL_MS = 3800
/** Finish anyway if the exit's animationend never arrives (a hidden tab, say). */
const EXIT_GRACE_MS = 400
const EXIT_ANIMATIONS = new Set(['nc-splash-out', 'nc-splash-fade-out'])

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Design-canvas crop marks just outside a 180x240 tile's corners. */
function CropMarks() {
  return (
    <svg className="nc-splash__marks" viewBox="0 0 208 268" aria-hidden="true">
      <path d="M0 14H10M14 0V10M198 14H208M194 0V10M0 254H10M14 258V268M198 254H208M194 258V268" />
    </svg>
  )
}

/**
 * Startup sequence over the already-mounted feed: dotted grid, the icon scales in and
 * rises with the wordmark, a strip of game covers, then a fade to black. Leaves once the
 * first card is ready (3s at the earliest, 3.8s at the latest) and calls `onExited` when
 * the exit animation has finished. Never waits on lazy chunks.
 */
export function Splash({ ready, onExited }: { ready: boolean; onExited: () => void }) {
  const [shownAt] = useState(() => performance.now())
  const [exitMs] = useState(() => (prefersReducedMotion() ? REDUCED_EXIT_MS : EXIT_MS))
  const [phase, setPhase] = useState<'intro' | 'leaving' | 'gone'>('intro')
  const exitedRef = useRef(false)
  const onExitedRef = useRef(onExited)
  const centre = Math.floor(games.length / 2)

  useEffect(() => {
    onExitedRef.current = onExited
  })

  const finish = useCallback(() => {
    if (exitedRef.current)
      return
    exitedRef.current = true
    setPhase('gone')
    onExitedRef.current()
  }, [])

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
    const timer = window.setTimeout(finish, exitMs + EXIT_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [exitMs, finish, phase])

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && EXIT_ANIMATIONS.has(event.animationName))
      finish()
  }

  if (phase === 'gone')
    return null
  return (
    <div className={phase === 'leaving' ? 'nc-splash is-leaving' : 'nc-splash'} role="status" aria-label="Nimcade" onAnimationEnd={onAnimationEnd}>
      <div className="nc-splash__grid" />
      <div className="nc-splash__tiles" aria-hidden="true">
        <div className="nc-splash__strip">
          {games.map((game, i) => {
            const Cover = getCover(game.id)
            return Cover && (
              <div key={game.id} className="nc-splash__slot" style={{ '--i': i } as CSSProperties}>
                <div className={i === centre ? 'nc-splash__frame is-centre' : 'nc-splash__frame'}>
                  <Cover />
                  <CropMarks />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="nc-splash__veil" />
      {/* The wordmark rides with the icon, so it fades in under it while both rise. */}
      <div className="nc-splash__rise" aria-hidden="true">
        <NimcadeIcon className="nc-splash__icon" squareClassName="nc-splash__square" glyphClassName="nc-splash__glyph" />
        <Wordmark tone="black" height={28} className="nc-splash__wordmark" />
      </div>
    </div>
  )
}

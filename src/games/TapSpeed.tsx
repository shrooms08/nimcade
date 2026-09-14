import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { readBest } from '../lib/scores'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { useGameLoop } from './shared/useGameLoop'
import { useRound } from './shared/useRound'
import type { GameProps } from './types'

export const TAP_SPEED_ID = 'tap-speed'

export const ROUND_MS = 60_000
/** The clock turns gold for the last stretch. */
const LOW_TIME_MS = 10_000
/** Taps per second is measured over this trailing window. */
const RATE_WINDOW_MS = 2_000
/** Old ripples are dropped past this many, in case animationend never fires. */
const MAX_RIPPLES = 24

function setText(element: HTMLElement | null, value: string) {
  if (element && element.textContent !== value)
    element.textContent = value
}

/** Restarts the 120ms scale pop. */
function pop(element: HTMLElement | null) {
  if (!element)
    return
  element.classList.remove('is-pop')
  void element.offsetWidth
  element.classList.add('is-pop')
}

/** How many taps in 60 seconds. The first tap starts the clock and counts. */
export default function TapSpeed({ active, onScore }: GameProps) {
  const round = useRound(TAP_SPEED_ID, active, onScore)
  const clockRef = useRef<HTMLSpanElement | null>(null)
  const countRef = useRef<HTMLSpanElement | null>(null)
  const bestRef = useRef<HTMLSpanElement | null>(null)
  const rateRef = useRef<HTMLSpanElement | null>(null)
  const ripplesRef = useRef<HTMLDivElement | null>(null)
  /** performance.now() of the first tap; 0 before the round starts. */
  const startRef = useRef(0)
  const tapsRef = useRef(0)
  const bestAtStartRef = useRef(0)
  /** Timestamps of taps inside the rate window. */
  const recentRef = useRef<number[]>([])

  const showRate = useCallback((now: number) => {
    const recent = recentRef.current
    while (recent.length > 0 && now - recent[0] > RATE_WINDOW_MS)
      recent.shift()
    const span = Math.min(RATE_WINDOW_MS, Math.max(500, now - startRef.current))
    setText(rateRef.current, ((recent.length * 1000) / span).toFixed(1))
  }, [])

  const { start, stop } = useGameLoop(() => {
    const now = performance.now()
    const remaining = Math.max(0, ROUND_MS - (now - startRef.current))
    setText(clockRef.current, String(Math.ceil(remaining / 1000)))
    clockRef.current?.classList.toggle('is-low', remaining < LOW_TIME_MS)
    showRate(now)
    if (remaining === 0) {
      round.finish(tapsRef.current, 'Time!')
      return false
    }
    return true
  })

  // Pause and reset whenever the card leaves play.
  const reset = useCallback(() => {
    stop()
    startRef.current = 0
    tapsRef.current = 0
    recentRef.current = []
    bestAtStartRef.current = readBest(TAP_SPEED_ID)
    setText(clockRef.current, String(ROUND_MS / 1000))
    clockRef.current?.classList.remove('is-low')
    setText(countRef.current, '0')
    setText(bestRef.current, String(bestAtStartRef.current))
    setText(rateRef.current, '0.0')
    ripplesRef.current?.replaceChildren()
  }, [stop])

  useEffect(() => {
    reset()
    return stop
  }, [active, reset, stop])

  const ripple = (event: ReactPointerEvent) => {
    const host = ripplesRef.current
    if (!host)
      return
    const rect = host.getBoundingClientRect()
    const ring = document.createElement('span')
    ring.className = 'tap-speed__ripple'
    ring.style.left = `${event.clientX - rect.left}px`
    ring.style.top = `${event.clientY - rect.top}px`
    ring.addEventListener('animationend', () => ring.remove(), { once: true })
    host.append(ring)
    while (host.childElementCount > MAX_RIPPLES)
      host.firstElementChild?.remove()
  }

  const tap = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Multi-touch is ignored: only the primary pointer counts, one tap per pointerdown.
    if (!active || !event.isPrimary || round.phase === 'over')
      return
    const now = performance.now()
    if (startRef.current === 0) {
      startRef.current = now
      round.begin()
      start()
    }
    else if (now - startRef.current >= ROUND_MS) {
      return // time is up; the loop ends the round on its next frame
    }
    tapsRef.current += 1
    recentRef.current.push(now)
    const count = String(tapsRef.current)
    setText(countRef.current, count)
    setText(bestRef.current, String(Math.max(bestAtStartRef.current, tapsRef.current)))
    pop(countRef.current)
    ripple(event)
    showRate(now)
  }

  return (
    <div className="game-shell">
      <div className="game-surface tap-speed" onPointerDown={tap}>
        <GameHud label="Best" scoreRef={bestRef} secondaryLabel="Taps/s" secondaryRef={rateRef} secondaryInitial="0.0" />
        <div className="game-board">
          <span ref={clockRef} className="tap-speed__clock">{ROUND_MS / 1000}</span>
          <span ref={countRef} className="tap-speed__count">0</span>
          {round.phase === 'ready' && <p className="game-hint">Tap anywhere to start</p>}
        </div>
        <div ref={ripplesRef} className="tap-speed__ripples" aria-hidden="true" />
      </div>
      {round.phase === 'over' && round.result && (
        <EndPanel reason={round.result.reason} score={round.result.score} best={round.result.best} />
      )}
    </div>
  )
}

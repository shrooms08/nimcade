import { useEffect, useRef, useState } from 'react'
import { EndPanel } from './shared/EndPanel'
import { useGameLoop } from './shared/useGameLoop'
import { useRound } from './shared/useRound'
import type { GameProps } from './types'

export const TAP_TEMPO_ID = 'tap-tempo'

/** Milliseconds between beats (80 BPM). */
const BEAT_MS = 750
/** How far from the beat, either side, a tap may land. Shrinks with every hit. */
const WINDOW_START_MS = 180
const WINDOW_STEP_MS = 4
const WINDOW_FLOOR_MS = 70

const windowFor = (hits: number) => Math.max(WINDOW_FLOOR_MS, WINDOW_START_MS - WINDOW_STEP_MS * hits)

export default function TapTempo({ active, onScore }: GameProps) {
  const round = useRound(TAP_TEMPO_ID, active, onScore)
  const [score, setScore] = useState(0)

  /** performance.now() of the starting tap, which is beat 0. */
  const startRef = useRef(0)
  /** Successful taps; the next expected beat is hits + 1. */
  const hitsRef = useRef(0)
  const circleRef = useRef<HTMLSpanElement | null>(null)

  const settleCircle = () => {
    if (circleRef.current)
      circleRef.current.style.transform = 'scale(1)'
  }

  const endRound = () => {
    settleCircle()
    round.finish(hitsRef.current, 'Off beat!')
  }

  const { start: startPulse, stop: stopPulse } = useGameLoop(() => {
    const elapsed = performance.now() - startRef.current
    // A beat went by with no tap: its window has fully closed.
    const nextBeat = hitsRef.current + 1
    if (elapsed > nextBeat * BEAT_MS + windowFor(hitsRef.current)) {
      endRound()
      return false // stops the loop
    }
    // Sharp attack on the beat, easing back out until the next one.
    const progress = (elapsed % BEAT_MS) / BEAT_MS
    const scale = 1 + 0.35 * (1 - progress) ** 3
    if (circleRef.current)
      circleRef.current.style.transform = `scale(${scale.toFixed(3)})`
    return true
  })

  // Pause and reset whenever the card scrolls in or out of view.
  useEffect(() => {
    stopPulse()
    hitsRef.current = 0
    startRef.current = 0
    if (circleRef.current)
      circleRef.current.style.transform = 'scale(1)'
    return stopPulse
  }, [active, stopPulse])

  const start = () => {
    hitsRef.current = 0
    setScore(0)
    round.begin()
    startRef.current = performance.now()
    startPulse()
  }

  const tap = () => {
    if (round.phase !== 'playing')
      return
    const elapsed = performance.now() - startRef.current
    const offset = elapsed - (hitsRef.current + 1) * BEAT_MS
    if (Math.abs(offset) > windowFor(hitsRef.current)) {
      stopPulse()
      endRound()
      return
    }
    hitsRef.current += 1
    setScore(hitsRef.current)
  }

  const playing = round.phase === 'playing'

  return (
    <div className="game game--tap-tempo">
      {round.phase === 'over' && round.result
        ? (
            <EndPanel
              reason={round.result.reason}
              score={round.result.score}
              best={round.result.best}
              overlay={false}
              onPlayAgain={start}
            />
          )
        : (
            <button
              type="button"
              className="tap-tempo__pad"
              onPointerDown={playing ? tap : start}
              aria-label={playing ? 'Tap on the beat' : 'Start Tap Tempo'}
            >
              <span ref={circleRef} className="tap-tempo__circle">
                <span className="tap-tempo__label">{playing ? score : 'Tap'}</span>
              </span>
            </button>
          )}

      <p className="game__hint">
        {round.phase === 'ready' && 'Tap the circle, then tap on every beat.'}
        {playing && `Score ${score}`}
      </p>
    </div>
  )
}

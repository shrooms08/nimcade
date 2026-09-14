import { useEffect, useRef, useState } from 'react'
import { EndPanel } from './shared/EndPanel'
import { useGameLoop } from './shared/useGameLoop'
import { useRound } from './shared/useRound'
import type { GameProps } from './types'

export const TAP_TEMPO_ID = 'tap-tempo'

/** Milliseconds between beats (80 BPM). */
const BEAT_MS = 750
const TOTAL_TAPS = 10

function pointsForOffset(offsetMs: number): number {
  // A tap exactly on the beat scores 100; half a beat off scores 0.
  const ratio = Math.min(1, Math.abs(offsetMs) / (BEAT_MS / 2))
  return Math.round((1 - ratio) * 100)
}

function verdict(score: number): string {
  if (score >= 90)
    return 'Metronome.'
  if (score >= 70)
    return 'Tight.'
  if (score >= 45)
    return 'Off the beat.'
  return 'Chaos.'
}

export default function TapTempo({ active, onScore }: GameProps) {
  const round = useRound(TAP_TEMPO_ID, active, onScore)
  const [taps, setTaps] = useState(0)
  const [lastPoints, setLastPoints] = useState<number | null>(null)

  const startRef = useRef(0)
  const pointsRef = useRef<number[]>([])
  const circleRef = useRef<HTMLSpanElement | null>(null)

  const { start: startPulse, stop: stopPulse } = useGameLoop(() => {
    const elapsed = performance.now() - startRef.current
    // Progress through the current beat, 0 -> 1.
    const progress = (elapsed % BEAT_MS) / BEAT_MS
    // Sharp attack on the beat, easing back out until the next one.
    const scale = 1 + 0.35 * (1 - progress) ** 3
    if (circleRef.current)
      circleRef.current.style.transform = `scale(${scale.toFixed(3)})`
    return true
  })

  const settleCircle = () => {
    if (circleRef.current)
      circleRef.current.style.transform = 'scale(1)'
  }

  // Pause and reset whenever the card scrolls in or out of view.
  useEffect(() => {
    stopPulse()
    pointsRef.current = []
    startRef.current = 0
    if (circleRef.current)
      circleRef.current.style.transform = 'scale(1)'
    return stopPulse
  }, [active, stopPulse])

  const start = () => {
    pointsRef.current = []
    setTaps(0)
    setLastPoints(null)
    round.begin()
    startRef.current = performance.now()
    startPulse()
  }

  const tap = () => {
    if (round.phase !== 'playing')
      return

    const elapsed = performance.now() - startRef.current
    const offset = elapsed - Math.round(elapsed / BEAT_MS) * BEAT_MS
    const points = pointsForOffset(offset)
    pointsRef.current = [...pointsRef.current, points]
    setTaps(pointsRef.current.length)
    setLastPoints(points)

    if (pointsRef.current.length >= TOTAL_TAPS) {
      stopPulse()
      settleCircle()
      const total = pointsRef.current.reduce((sum, value) => sum + value, 0)
      round.finish(Math.round(total / pointsRef.current.length), '')
    }
  }

  const score = round.result?.score ?? null
  const playing = round.phase === 'playing'

  return (
    <div className="game game--tap-tempo">
      {round.phase === 'over' && score !== null
        ? <EndPanel score={score} detail={verdict(score)} overlay={false} onPlayAgain={start} />
        : (
            <button
              type="button"
              className="tap-tempo__pad"
              onPointerDown={playing ? tap : start}
              aria-label={playing ? 'Tap on the beat' : 'Start Tap Tempo'}
            >
              <span ref={circleRef} className="tap-tempo__circle">
                <span className="tap-tempo__label">{playing ? `${TOTAL_TAPS - taps}` : 'Tap'}</span>
              </span>
            </button>
          )}

      <p className="game__hint">
        {round.phase === 'ready' && 'Tap the circle, then hit every beat. 10 taps.'}
        {playing && (lastPoints === null ? 'Hit the beat.' : `+${lastPoints}`)}
        {round.phase === 'over' && `${TOTAL_TAPS} taps · avg ${score} / 100`}
      </p>
    </div>
  )
}

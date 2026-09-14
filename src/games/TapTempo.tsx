import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps } from './types'

/** Milliseconds between beats (80 BPM). */
const BEAT_MS = 750
const TOTAL_TAPS = 10

type Phase = 'ready' | 'playing' | 'done'

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
  const [phase, setPhase] = useState<Phase>('ready')
  const [taps, setTaps] = useState<number[]>([])
  const [lastPoints, setLastPoints] = useState<number | null>(null)
  const [score, setScore] = useState<number | null>(null)

  const startRef = useRef<number>(0)
  const tapsRef = useRef<number[]>([])
  const circleRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    stopLoop()
    tapsRef.current = []
    startRef.current = 0
    setTaps([])
    setLastPoints(null)
    setScore(null)
    setPhase('ready')
    if (circleRef.current)
      circleRef.current.style.transform = 'scale(1)'
  }, [stopLoop])

  // Pause and reset whenever the card scrolls out of view.
  useEffect(() => {
    if (!active)
      reset()
    return stopLoop
  }, [active, reset, stopLoop])

  const start = useCallback(() => {
    tapsRef.current = []
    setTaps([])
    setLastPoints(null)
    setScore(null)
    setPhase('playing')
    startRef.current = performance.now()

    const tick = () => {
      const elapsed = performance.now() - startRef.current
      // Progress through the current beat, 0 -> 1.
      const progress = (elapsed % BEAT_MS) / BEAT_MS
      // Sharp attack on the beat, easing back out until the next one.
      const scale = 1 + 0.35 * (1 - progress) ** 3
      if (circleRef.current)
        circleRef.current.style.transform = `scale(${scale.toFixed(3)})`
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [])

  const tap = useCallback(() => {
    if (phase !== 'playing')
      return

    const elapsed = performance.now() - startRef.current
    const offset = elapsed - Math.round(elapsed / BEAT_MS) * BEAT_MS
    const points = pointsForOffset(offset)

    tapsRef.current = [...tapsRef.current, points]
    setTaps(tapsRef.current)
    setLastPoints(points)

    if (tapsRef.current.length >= TOTAL_TAPS) {
      stopLoop()
      if (circleRef.current)
        circleRef.current.style.transform = 'scale(1)'
      const total = tapsRef.current.reduce((sum, value) => sum + value, 0)
      const final = Math.round(total / tapsRef.current.length)
      setScore(final)
      setPhase('done')
      onScore(final)
    }
  }, [onScore, phase, stopLoop])

  return (
    <div className="game game--tap-tempo">
      {phase === 'done' && score !== null
        ? (
            <div className="game__panel" data-feed-scroll>
              <p className="game__score">{score}</p>
              <p className="game__verdict">{verdict(score)}</p>
              <button type="button" className="button button--primary" onClick={start}>
                Play again
              </button>
            </div>
          )
        : (
            <button
              type="button"
              className="tap-tempo__pad"
              onPointerDown={phase === 'playing' ? tap : start}
              aria-label={phase === 'playing' ? 'Tap on the beat' : 'Start Tap Tempo'}
            >
              <span ref={circleRef} className="tap-tempo__circle">
                <span className="tap-tempo__label">
                  {phase === 'playing' ? `${TOTAL_TAPS - taps.length}` : 'Tap'}
                </span>
              </span>
            </button>
          )}

      <p className="game__hint">
        {phase === 'ready' && 'Tap the circle, then hit every beat. 10 taps.'}
        {phase === 'playing' && (lastPoints === null ? 'Hit the beat.' : `+${lastPoints}`)}
        {phase === 'done' && `${TOTAL_TAPS} taps · avg ${score} / 100`}
      </p>
    </div>
  )
}

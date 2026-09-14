import type { RefObject } from 'react'
import { ROUND_SECONDS } from './effects'

/** Score on the left, big countdown in the middle. Both are updated by ref. */
export function GameHud({
  label,
  scoreRef,
  countdownRef,
}: {
  label: string
  scoreRef: RefObject<HTMLSpanElement | null>
  countdownRef: RefObject<HTMLSpanElement | null>
}) {
  return (
    <div className="game-hud">
      <span className="game-stat">
        <span className="game-stat__label">{label}</span>
        <span ref={scoreRef} className="game-stat__value">0</span>
      </span>
      <span ref={countdownRef} className="game-countdown" aria-live="off">
        {ROUND_SECONDS}
      </span>
      <span aria-hidden="true" />
    </div>
  )
}

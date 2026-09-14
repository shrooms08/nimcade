import type { RefObject } from 'react'

/** The running score, updated by ref so the game never re-renders per frame. */
export function GameHud({
  label,
  scoreRef,
}: {
  label: string
  scoreRef: RefObject<HTMLSpanElement | null>
}) {
  return (
    <div className="game-hud">
      <span className="game-stat">
        <span className="game-stat__label">{label}</span>
        <span ref={scoreRef} className="game-stat__value">0</span>
      </span>
    </div>
  )
}

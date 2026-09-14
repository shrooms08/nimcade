import type { RefObject } from 'react'

/**
 * The running score, plus an optional second stat on the right (e.g. the
 * wave). Values are updated by ref so the game never re-renders per frame.
 */
export function GameHud({
  label,
  scoreRef,
  secondaryLabel,
  secondaryRef,
  secondaryInitial = '0',
}: {
  label: string
  scoreRef: RefObject<HTMLSpanElement | null>
  secondaryLabel?: string
  secondaryRef?: RefObject<HTMLSpanElement | null>
  secondaryInitial?: string
}) {
  return (
    <div className="game-hud">
      <span className="game-stat">
        <span className="game-stat__label">{label}</span>
        <span ref={scoreRef} className="game-stat__value">0</span>
      </span>
      {secondaryLabel && (
        <span className="game-stat game-stat--end">
          <span className="game-stat__label">{secondaryLabel}</span>
          <span ref={secondaryRef} className="game-stat__value">{secondaryInitial}</span>
        </span>
      )}
    </div>
  )
}

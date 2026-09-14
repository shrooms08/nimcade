import { Coin } from '../components/Coin'
import { TrophyIcon } from '../components/icons'

export interface GameOverInfo {
  reason: string
  score: number
  /** Best before this round. */
  previousBest: number
  newBest: boolean
}

/** Gold/white particles from the prototype's new-best burst: [size, dx, dy, colour, delay]. */
const BURST: [number, number, number, 'gold' | 'white', number][] = [
  [6, -96, -54, 'gold', 0], [4, 84, -70, 'gold', 0.05], [5, -120, 22, 'white', 0.1], [7, 118, 34, 'gold', 0.12],
  [4, -36, -104, 'gold', 0.18], [5, 48, 96, 'white', 0.22], [6, -68, 86, 'gold', 0.28],
]

/**
 * Covers the card when a round ends. The card is back in browse mode, so a
 * swipe anywhere on this overlay scrolls the feed.
 */
export function GameOverOverlay({
  info,
  onPlayAgain,
  onTip,
  onCup,
  onNext,
}: {
  info: GameOverInfo
  onPlayAgain: () => void
  onTip: () => void
  onCup: () => void
  onNext: () => void
}) {
  const best = Math.max(info.previousBest, info.score)
  return (
    <div className="nc-over" role="dialog" aria-label="Game over">
      {info.newBest && (
        <>
          <div className="nc-over__burst" aria-hidden="true">
            {BURST.map(([size, dx, dy, tone, delay], i) => (
              <i
                key={i}
                className={`nc-over__spark nc-over__spark--${tone}`}
                style={{ width: size, height: size, ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${delay}s` }}
              />
            ))}
          </div>
          <span className="nc-over__new-best">NEW BEST</span>
        </>
      )}
      <span className="nc-over__reason">{info.reason}</span>
      <span className="nc-over__score nc-num">{info.score.toLocaleString()}</span>
      <span className="nc-over__best">
        {info.newBest ? `previous ${info.previousBest.toLocaleString()}` : `best ${best.toLocaleString()}`}
      </span>
      <button type="button" className="nc-over__rank" onClick={onCup}>
        <TrophyIcon />
        {/* TODO(backend): real daily rank */}
        <span>#— today</span>
      </button>
      <div className="nc-over__actions">
        <button type="button" className="nc-btn nc-btn--white" onClick={onPlayAgain}>Play again</button>
        <button type="button" className="nc-btn nc-btn--gold" onClick={onTip}>
          <Coin size={16} inverted />
          Tip NIM
        </button>
      </div>
      <button type="button" className="nc-over__next" onClick={onNext}>Swipe for the next game</button>
    </div>
  )
}

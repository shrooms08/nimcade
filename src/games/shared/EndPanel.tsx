/**
 * End-of-round panel: why the round ended, the score, and the best. Marked
 * `data-feed-scroll`, so swiping on it moves the feed even though it sits
 * inside a game stage.
 */
export function EndPanel({
  reason,
  score,
  best,
  overlay = true,
  onPlayAgain,
}: {
  /** One line, e.g. "Caught!". */
  reason: string
  score: number
  best: number
  /** Covers the play area; false renders it in normal flow. */
  overlay?: boolean
  onPlayAgain: () => void
}) {
  return (
    <div className={overlay ? 'game__panel game-end' : 'game__panel'} data-feed-scroll>
      <p className="game-end__title">{reason}</p>
      <p className="game__score">{score}</p>
      <p className="game__verdict">{score === best && score > 0 ? 'New best' : `Best ${best}`}</p>
      <button type="button" className="button button--primary" onClick={onPlayAgain}>
        Play again
      </button>
    </div>
  )
}

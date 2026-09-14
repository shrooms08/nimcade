/**
 * End-of-round panel. Marked `data-feed-scroll`, so swiping on it moves the
 * feed even though it sits inside a game stage.
 */
export function EndPanel({
  title,
  score,
  best,
  detail,
  overlay = true,
  onPlayAgain,
}: {
  title?: string
  score: number
  /** Shown as "New best" / "Best N" unless `detail` is given. */
  best?: number
  detail?: string
  /** Covers the play area; false renders it in normal flow. */
  overlay?: boolean
  onPlayAgain: () => void
}) {
  const line = detail
    ?? (best === undefined ? '' : score === best && score > 0 ? 'New best' : `Best ${best}`)

  return (
    <div className={overlay ? 'game__panel game-end' : 'game__panel'} data-feed-scroll>
      {title && <p className="game-end__title">{title}</p>}
      <p className="game__score">{score}</p>
      <p className="game__verdict">{line}</p>
      <button type="button" className="button button--primary" onClick={onPlayAgain}>
        Play again
      </button>
    </div>
  )
}

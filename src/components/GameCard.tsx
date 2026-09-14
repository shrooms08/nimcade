import { useCallback, useState } from 'react'
import type { Game } from '../games/types'
import { readBest, writeBest } from '../lib/scores'
import { TIP_NIM } from '../lib/tip'

export default function GameCard({
  game,
  active,
  onTip,
}: {
  game: Game
  active: boolean
  onTip: (game: Game) => Promise<void>
}) {
  const [best, setBest] = useState(() => readBest(game.id))
  const [lastScore, setLastScore] = useState<number | null>(null)
  const [tipping, setTipping] = useState(false)
  const GameComponent = game.component

  const handleScore = useCallback(
    (score: number) => {
      setLastScore(score)
      setBest((current) => {
        if (score <= current)
          return current
        writeBest(game.id, score)
        return score
      })
    },
    [game.id],
  )

  const handleTip = useCallback(async () => {
    if (tipping)
      return
    setTipping(true)
    try {
      await onTip(game)
    }
    finally {
      setTipping(false)
    }
  }, [game, onTip, tipping])

  return (
    <section className="card" data-game-id={game.id}>
      <div className="card__stage">
        <GameComponent active={active} onScore={handleScore} />
      </div>

      <div className="card__meta">
        <div className="card__titles">
          <h2 className="card__title">{game.title}</h2>
          <p className="card__maker">
            by
            {' '}
            {game.maker}
          </p>
        </div>

        <div className="card__stats">
          <span className="stat">
            <span className="stat__label">Best</span>
            <span className="stat__value">{best}</span>
          </span>
          {lastScore !== null && (
            <span className="stat">
              <span className="stat__label">Last</span>
              <span className="stat__value">{lastScore}</span>
            </span>
          )}
        </div>

        <button
          type="button"
          className="button button--tip"
          onClick={handleTip}
          disabled={tipping}
        >
          {tipping ? 'Confirm in Nimiq Pay…' : `Tip ${TIP_NIM} NIM`}
        </button>
      </div>
    </section>
  )
}

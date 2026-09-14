import { useEffect, useState } from 'react'
import type { Game } from '../../games/types'
import { cupSource } from '../../lib/cupMock'
import type { CupSnapshot } from '../../lib/cupMock'
import { readBest } from '../../lib/scores'
import { Coin } from '../components/Coin'
import { Sheet } from '../components/Sheet'
import { shortAddress } from '../format'

const DAY_MS = 86_400_000

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

/** Today's Daily Cup per game: prize pool, countdown to 00:00 UTC, top 10 and your standing. */
export function CupSheet({
  games,
  initialGameId,
  address,
  onClose,
}: {
  games: Game[]
  initialGameId: string
  address: string | null
  onClose: () => void
}) {
  const [gameId, setGameId] = useState(initialGameId)
  const [snapshot, setSnapshot] = useState<CupSnapshot | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const day = Math.floor(now / DAY_MS)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    cupSource.getSnapshot(gameId, { bestScore: readBest(gameId), address }).then((next) => {
      if (!cancelled)
        setSnapshot(next)
    })
    return () => {
      cancelled = true
    }
  }, [gameId, address, day])

  const game = games.find(g => g.id === gameId) ?? games[0]
  const cup = snapshot?.gameId === gameId ? snapshot : null
  const you = cup?.you

  return (
    <Sheet label="Daily Cup" onClose={onClose} tall>
      <div className="nc-cup-tabs" role="tablist" aria-label="Game">
        {games.map(g => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === gameId}
            className={g.id === gameId ? 'nc-cup-tab is-on' : 'nc-cup-tab'}
            onClick={() => setGameId(g.id)}
          >
            {g.title}
          </button>
        ))}
      </div>

      <div className="nc-cup-head">
        <div className="nc-cup-head__block">
          <span className="nc-caps">Prize pool</span>
          <span className="nc-cup-pool nc-num"><Coin size={22} />{cup ? cup.prizePoolNim.toLocaleString() : '—'}</span>
        </div>
        <div className="nc-cup-head__block nc-cup-head__block--end">
          <span className="nc-caps">Resets in (UTC)</span>
          <span className="nc-cup-clock nc-num">{cup ? clock(cup.resetsAt - now) : '--:--:--'}</span>
        </div>
      </div>

      <ol className="nc-cup-rows" aria-label={`${game.title} top 10`}>
        {!cup && <li className="nc-cup-row nc-cup-row--loading">Loading today's Cup…</li>}
        {cup?.top.map(entry => (
          <li key={entry.rank} className={entry.prizeNim ? 'nc-cup-row is-prize' : 'nc-cup-row'}>
            <span className="nc-cup-row__rank">{entry.rank}</span>
            <span className="nc-cup-row__name">{entry.name}</span>
            <span className="nc-cup-row__score nc-num">{entry.score.toLocaleString()}</span>
            <span className="nc-cup-row__prize">{entry.prizeNim ? `${entry.prizeNim} NIM` : ''}</span>
          </li>
        ))}
      </ol>

      <div className="nc-cup-you">
        <span className="nc-cup-you__rank">{you?.rank ?? '—'}</span>
        <div className="nc-cup-you__text">
          <span className="nc-cup-you__name">You · {address ? shortAddress(address) : 'not connected'}</span>
          <span className="nc-cup-you__sub">
            {!you || you.rank === null
              ? `Play ${game.title} to enter`
              : you.toPrizeZone !== null
                ? `${you.toPrizeZone.toLocaleString()} to reach the prize zone`
                : 'In the prize zone'}
          </span>
        </div>
        <span className="nc-cup-you__score nc-num">{(you?.score ?? 0).toLocaleString()}</span>
      </div>
    </Sheet>
  )
}

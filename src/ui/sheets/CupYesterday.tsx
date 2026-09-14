import { useEffect, useState } from 'react'
import { cupSource } from '../../lib/cup'
import type { CupResult, CupWinner } from '../../lib/cup'
import { Coin } from '../components/Coin'
import { formatNim } from '../format'

function payoutLabel(cup: CupResult): string {
  if (cup.paid)
    return 'Paid out'
  return cup.prizePoolNim > 0 && cup.winners.length > 0 ? 'Pays 00:05 UTC' : 'No prizes'
}

function statusNote(winner: CupWinner): string | null {
  if (winner.status === 'due')
    return 'due'
  return winner.status === 'sending' ? 'sending' : null
}

/** The Cup sheet's "Yesterday" view: the finished pool and its top 3 with what each won. */
export function CupYesterday({ gameId, gameTitle }: { gameId: string; gameTitle: string }) {
  const [result, setResult] = useState<CupResult | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    cupSource.getYesterday(gameId)
      .then((next) => {
        if (cancelled)
          return
        setResult(next)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled)
          setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [gameId])

  const cup = result?.gameId === gameId ? result : null

  return (
    <>
      <div className="nc-cup-head">
        <div className="nc-cup-head__block">
          <span className="nc-caps">Yesterday's pool</span>
          <span className="nc-cup-pool nc-num"><Coin size={22} />{cup ? formatNim(cup.prizePoolNim) : '—'}</span>
        </div>
        <div className="nc-cup-head__block nc-cup-head__block--end">
          <span className="nc-caps">Payout</span>
          <span className="nc-cup-clock">{cup ? payoutLabel(cup) : '—'}</span>
        </div>
      </div>

      <ol className="nc-cup-rows" aria-label={`${gameTitle} yesterday's winners`}>
        {!cup && <li className="nc-cup-row nc-cup-row--loading">{failed ? "Couldn't load yesterday's Cup." : "Loading yesterday's Cup…"}</li>}
        {cup && cup.winners.length === 0 && <li className="nc-cup-row nc-cup-row--loading">No scores yesterday.</li>}
        {cup?.winners.map((winner) => {
          const note = statusNote(winner)
          return (
            <li key={winner.rank} className={winner.prizeNim ? 'nc-cup-row is-prize' : 'nc-cup-row'}>
              <span className="nc-cup-row__rank">{winner.rank}</span>
              <span className="nc-cup-row__name">{winner.name}</span>
              <span className="nc-cup-row__score nc-num">{winner.score.toLocaleString()}</span>
              <span className="nc-cup-row__prize">
                {winner.prizeNim ? `${formatNim(winner.prizeNim)} NIM` : ''}
                {note && <span className="nc-cup-row__status">{note}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </>
  )
}

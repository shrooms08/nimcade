import { useCallback, useEffect, useRef, useState } from 'react'
import { readBest } from '../../lib/scores'

export type Phase = 'ready' | 'playing' | 'over'

export interface RoundResult {
  score: number
  best: number
  title: string
}

/**
 * Round phase and result for one game card. Whenever `active` flips, the
 * phase drops back to 'ready' during render, so a card scrolled away and back
 * always shows a fresh, unstarted round.
 */
export function useRound(gameId: string, active: boolean, onScore: (score: number) => void) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<RoundResult | null>(null)
  const [prevActive, setPrevActive] = useState(active)
  const onScoreRef = useRef(onScore)

  if (prevActive !== active) {
    setPrevActive(active)
    setPhase('ready')
    setResult(null)
  }

  useEffect(() => {
    onScoreRef.current = onScore
  }, [onScore])

  const begin = useCallback(() => setPhase('playing'), [])

  /** Ends the round: shows the result and reports the score to the card. */
  const finish = useCallback(
    (score: number, title: string) => {
      // The card writes the new best after onScore, so compute it here.
      const best = Math.max(readBest(gameId), score)
      setResult({ score, best, title })
      setPhase('over')
      onScoreRef.current(score)
    },
    [gameId],
  )

  const clear = useCallback(() => {
    setResult(null)
    setPhase('ready')
  }, [])

  return { phase, result, begin, finish, clear }
}

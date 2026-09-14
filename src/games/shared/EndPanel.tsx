import { useEffect } from 'react'
import { useRoundReporter } from './roundReport'

/**
 * Games render this when a round ends. It draws nothing itself: it reports the
 * result to the feed card, which shows the game-over overlay and returns the
 * card to browse mode (the game resets itself when it goes inactive).
 */
export function EndPanel({ reason, score, best }: { reason: string; score: number; best: number }) {
  const report = useRoundReporter()
  useEffect(() => {
    report({ reason, score, best })
  }, [report, reason, score, best])
  return null
}

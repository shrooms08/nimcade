import { useEffect, useState } from 'react'
import { backendOn, supabase } from './supabase'

/**
 * Tips per game from the tip_counts view (aggregates only; individual tips aren't readable).
 * Null while loading, when the backend is off, or when the request fails.
 */
export function useTipCounts(refreshKey: number): Record<string, number> | null {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    if (!backendOn || !supabase)
      return
    let cancelled = false
    supabase.from('tip_counts').select('game_id, tips').then(({ data, error }) => {
      if (cancelled || error)
        return
      setCounts(Object.fromEntries(((data ?? []) as { game_id: string; tips: number }[]).map(row => [row.game_id, Number(row.tips)])))
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return counts
}

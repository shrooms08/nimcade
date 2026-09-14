import { utcDay } from '../../supabase/functions/_shared/scoreMessage.ts'
import { shortAddress } from '../ui/format'
import type { CupDataSource, CupEntry, CupStanding } from './cupMock'
import { nextUtcMidnight } from './cupMock'
import { LUNA_PER_NIM } from './nimiq'
import { supabase } from './supabase'

/** Share of the day's pool paid to ranks 1, 2 and 3. */
export const PRIZE_SPLIT = [0.5, 0.3, 0.2]
const BOARD_SIZE = 10

interface BoardRow { rank: number | string; name: string | null; wallet: string; score: number }

/** NIM a rank wins from a pool, or null outside the prize ranks. */
export function prizeNim(rank: number, poolLuna: number): number | null {
  const share = PRIZE_SPLIT[rank - 1]
  return share === undefined ? null : Math.floor(poolLuna * share) / LUNA_PER_NIM
}

/** Today's Cup from Supabase: the cup_board view, the cups pool, and the player's own row. */
export const apiCupSource: CupDataSource = {
  async getSnapshot(gameId, player) {
    if (!supabase)
      throw new Error('Supabase is not configured.')
    const day = utcDay()
    const [board, cup, mine] = await Promise.all([
      supabase.from('cup_board').select('rank, name, wallet, score').eq('game_id', gameId).eq('day', day).order('score', { ascending: false }).limit(BOARD_SIZE),
      supabase.from('cups').select('pool_luna').eq('game_id', gameId).eq('day', day).maybeSingle(),
      player.deviceId
        ? supabase.from('cup_board').select('rank, score').eq('game_id', gameId).eq('day', day).eq('device_id', player.deviceId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    const failed = board.error ?? cup.error ?? mine.error
    if (failed)
      throw failed

    const poolLuna = Number(cup.data?.pool_luna ?? 0)
    const top: CupEntry[] = ((board.data ?? []) as BoardRow[]).map((row) => {
      const rank = Number(row.rank)
      return { rank, name: row.name ?? shortAddress(row.wallet), score: row.score, prizeNim: prizeNim(rank, poolLuna) }
    })
    const lastPrize = top.filter(entry => entry.rank <= PRIZE_SPLIT.length).at(-1)
    const own = mine.data as { rank: number | string; score: number } | null
    const you: CupStanding = own
      ? {
          rank: Number(own.rank),
          score: own.score,
          toPrizeZone: Number(own.rank) > PRIZE_SPLIT.length && lastPrize ? lastPrize.score - own.score + 1 : null,
        }
      : { rank: null, score: 0, toPrizeZone: null }

    return { gameId, prizePoolNim: poolLuna / LUNA_PER_NIM, resetsAt: nextUtcMidnight(), top, you }
  },
  // TODO(backend, part 2): Cup payouts; nothing has been paid out yet.
  async getWinnings() {
    return 0
  },
}

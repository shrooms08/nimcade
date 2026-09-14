import { PAYOUT_SPLIT_PERCENT, previousUtcDay, splitPool } from '../../supabase/functions/_shared/cupPayout.ts'
import { formatAddress, isNimiqAddress } from '../../supabase/functions/_shared/nimiqRpc.ts'
import { utcDay } from '../../supabase/functions/_shared/scoreMessage.ts'
import { shortAddress } from '../ui/format'
import type { CupDataSource, CupEntry, CupStanding, CupWinner, PayoutStatus } from './cupMock'
import { nextUtcMidnight } from './cupMock'
import { LUNA_PER_NIM } from './nimiq'
import { supabase } from './supabase'

const BOARD_SIZE = 10
const PRIZE_RANKS = PAYOUT_SPLIT_PERCENT.length

interface BoardRow { rank: number | string; name: string | null; wallet: string; score: number }
interface PayoutRow { rank: number; name: string | null; wallet: string; score: number | null; amount_luna: number | string; status: PayoutStatus }
interface CupRow { pool_luna: number | string; seed_luna: number | string; paid_at?: string | null }

/** NIM a rank wins from a pool (in Luna, seed included), or null outside the prize ranks. */
export function prizeNim(rank: number, poolLuna: number): number | null {
  return rank >= 1 && rank <= PRIZE_RANKS ? splitPool(poolLuna)[rank - 1] / LUNA_PER_NIM : null
}

const totalLuna = (cup: CupRow | null) => Number(cup?.pool_luna ?? 0) + Number(cup?.seed_luna ?? 0)

function client() {
  if (!supabase)
    throw new Error('Supabase is not configured.')
  return supabase
}

/** The Cup from Supabase: the cup_board view, the cups pool, payouts, and the player's own row. */
export const apiCupSource: CupDataSource = {
  async getSnapshot(gameId, player) {
    const db = client()
    const day = utcDay()
    const [board, cup, mine] = await Promise.all([
      db.from('cup_board').select('rank, name, wallet, score').eq('game_id', gameId).eq('day', day).order('score', { ascending: false }).limit(BOARD_SIZE),
      db.from('cups').select('pool_luna, seed_luna').eq('game_id', gameId).eq('day', day).maybeSingle(),
      player.deviceId
        ? db.from('cup_board').select('rank, score').eq('game_id', gameId).eq('day', day).eq('device_id', player.deviceId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    const failed = board.error ?? cup.error ?? mine.error
    if (failed)
      throw failed

    const poolLuna = totalLuna(cup.data as CupRow | null)
    const top: CupEntry[] = ((board.data ?? []) as BoardRow[]).map((row) => {
      const rank = Number(row.rank)
      return { rank, name: row.name ?? shortAddress(row.wallet), score: row.score, prizeNim: prizeNim(rank, poolLuna) }
    })
    const lastPrize = top.filter(entry => entry.rank <= PRIZE_RANKS).at(-1)
    const own = mine.data as { rank: number | string; score: number } | null
    const you: CupStanding = own
      ? {
          rank: Number(own.rank),
          score: own.score,
          toPrizeZone: Number(own.rank) > PRIZE_RANKS && lastPrize ? lastPrize.score - own.score + 1 : null,
        }
      : { rank: null, score: 0, toPrizeZone: null }

    return { gameId, prizePoolNim: poolLuna / LUNA_PER_NIM, resetsAt: nextUtcMidnight(), top, you }
  },

  async getYesterday(gameId) {
    const db = client()
    const day = previousUtcDay()
    const [payouts, cup, board] = await Promise.all([
      db.from('payouts').select('rank, name, wallet, score, amount_luna, status').eq('game_id', gameId).eq('day', day).order('rank'),
      db.from('cups').select('pool_luna, seed_luna, paid_at').eq('game_id', gameId).eq('day', day).maybeSingle(),
      db.from('cup_board').select('rank, name, wallet, score').eq('game_id', gameId).eq('day', day).order('score', { ascending: false }).limit(PRIZE_RANKS),
    ])
    const failed = payouts.error ?? cup.error ?? board.error
    if (failed)
      throw failed

    const cupRow = cup.data as CupRow | null
    const poolLuna = totalLuna(cupRow)
    const paidRows = (payouts.data ?? []) as PayoutRow[]
    // Once pay-cup has run, the payouts are the record; before that, the final board and its projected prizes.
    const winners: CupWinner[] = paidRows.length > 0
      ? paidRows.map(row => ({ rank: row.rank, name: row.name ?? shortAddress(row.wallet), score: row.score ?? 0, prizeNim: Number(row.amount_luna) / LUNA_PER_NIM, status: row.status }))
      : ((board.data ?? []) as BoardRow[]).map((row) => {
          const rank = Number(row.rank)
          return { rank, name: row.name ?? shortAddress(row.wallet), score: row.score, prizeNim: prizeNim(rank, poolLuna), status: null }
        })
    return { gameId, day, prizePoolNim: poolLuna / LUNA_PER_NIM, paid: Boolean(cupRow?.paid_at), winners }
  },

  /** Every prize this wallet has won, paid or still due. */
  async getWinnings(address) {
    if (!address || !isNimiqAddress(address))
      return 0
    const { data, error } = await client().from('payouts').select('amount_luna').eq('wallet', formatAddress(address))
    if (error)
      throw error
    return ((data ?? []) as { amount_luna: number | string }[]).reduce((sum, row) => sum + Number(row.amount_luna), 0) / LUNA_PER_NIM
  },
}

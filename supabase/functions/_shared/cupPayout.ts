import { utcDay } from './scoreMessage.ts'

/** Ranks 1, 2 and 3 get 50%, 30% and 20% of the day's pool plus seed. */
export const PAYOUT_SPLIT_PERCENT = [50, 30, 20] as const

/** Whole-Luna prizes for the first `winners` ranks (rounded down; the dust stays in the hot wallet). */
export function splitPool(totalLuna: number, winners: number = PAYOUT_SPLIT_PERCENT.length): number[] {
  if (!Number.isSafeInteger(totalLuna) || totalLuna <= 0)
    return PAYOUT_SPLIT_PERCENT.slice(0, Math.max(0, winners)).map(() => 0)
  return PAYOUT_SPLIT_PERCENT.slice(0, Math.max(0, winners)).map(percent => Number((BigInt(totalLuna) * BigInt(percent)) / 100n))
}

/** The UTC day before `now`. */
export function previousUtcDay(now: Date = new Date()): string {
  return utcDay(new Date(now.getTime() - 86_400_000))
}

/** A real calendar day that has already ended in UTC. */
export function isFinishedDay(day: unknown, now: Date): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day))
    return false
  const parsed = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && utcDay(parsed) === day && day < utcDay(now)
}

export interface CupRow { poolLuna: number; seedLuna: number; paidAt: string | null }
export interface Winner { wallet: string; name: string | null; score: number }
export interface PayoutRow { gameId: string; day: string; rank: number; wallet: string; name: string | null; score: number; amountLuna: number }
export type PayoutUpdate = { status: 'sent'; txHash: string } | { status: 'due' }

export interface PayCupDeps {
  gameIds: readonly string[]
  loadCup: (gameId: string, day: string) => Promise<CupRow | null>
  /** The day's best scores, highest first (earlier entries win ties). */
  loadWinners: (gameId: string, day: string, limit: number) => Promise<Winner[]>
  /** Sets paid_at if the cup is still unpaid and non-empty; the pool plus seed, or null if it wasn't. */
  claimCup: (gameId: string, day: string) => Promise<number | null>
  insertPayouts: (rows: PayoutRow[]) => Promise<void>
  markPayout: (row: PayoutRow, update: PayoutUpdate) => Promise<void>
  /** Signs and broadcasts one prize; resolves with the transaction hash. */
  send: (row: PayoutRow) => Promise<string>
}

export interface PayoutSummary { rank: number; wallet: string; amountLuna: number; status: 'planned' | 'sent' | 'due'; txHash: string | null; error?: string }
export interface GameSummary {
  gameId: string
  status: 'planned' | 'paid' | 'partly-due' | 'due' | 'skipped' | 'error'
  reason?: string
  totalLuna?: number
  payouts?: PayoutSummary[]
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

function plan(gameId: string, day: string, totalLuna: number, winners: Winner[]): PayoutRow[] {
  const amounts = splitPool(totalLuna, winners.length)
  return winners
    .map((winner, i) => ({ gameId, day, rank: i + 1, wallet: winner.wallet, name: winner.name, score: winner.score, amountLuna: amounts[i] }))
    .filter(row => row.amountLuna > 0)
}

async function payGame(gameId: string, day: string, deps: PayCupDeps, dryRun: boolean): Promise<GameSummary> {
  const cup = await deps.loadCup(gameId, day)
  if (cup?.paidAt)
    return { gameId, status: 'skipped', reason: 'already paid' }
  const available = cup ? cup.poolLuna + cup.seedLuna : 0
  if (available <= 0)
    return { gameId, status: 'skipped', reason: 'empty pool' }
  const winners = await deps.loadWinners(gameId, day, PAYOUT_SPLIT_PERCENT.length)
  if (winners.length === 0)
    return { gameId, status: 'skipped', reason: 'no scores', totalLuna: available }
  if (plan(gameId, day, available, winners).length === 0)
    return { gameId, status: 'skipped', reason: 'pool too small to split', totalLuna: available }
  if (dryRun) {
    const rows = plan(gameId, day, available, winners)
    return { gameId, status: 'planned', totalLuna: available, payouts: rows.map(row => ({ rank: row.rank, wallet: row.wallet, amountLuna: row.amountLuna, status: 'planned', txHash: null })) }
  }

  // Claiming first (paid_at) means a second run, or a retry after a crash, never pays twice.
  const totalLuna = await deps.claimCup(gameId, day)
  if (totalLuna === null)
    return { gameId, status: 'skipped', reason: 'already paid' }
  const rows = plan(gameId, day, totalLuna, winners)
  await deps.insertPayouts(rows)

  const payouts: PayoutSummary[] = []
  for (const row of rows) {
    const base = { rank: row.rank, wallet: row.wallet, amountLuna: row.amountLuna }
    try {
      const txHash = await deps.send(row)
      await deps.markPayout(row, { status: 'sent', txHash })
      payouts.push({ ...base, status: 'sent', txHash })
    }
    catch (error) {
      await deps.markPayout(row, { status: 'due' }).catch(() => {})
      payouts.push({ ...base, status: 'due', txHash: null, error: message(error) })
    }
  }
  const due = payouts.filter(p => p.status === 'due').length
  return { gameId, status: due === 0 ? 'paid' : due === payouts.length ? 'due' : 'partly-due', totalLuna, payouts }
}

/** Pays every game's Cup for `day`. One game failing doesn't stop the others. */
export async function payCups(day: string, deps: PayCupDeps, options: { dryRun?: boolean } = {}): Promise<{ day: string; games: GameSummary[] }> {
  const games: GameSummary[] = []
  for (const gameId of deps.gameIds) {
    try {
      games.push(await payGame(gameId, day, deps, options.dryRun === true))
    }
    catch (error) {
      games.push({ gameId, status: 'error', reason: message(error) })
    }
  }
  return { day, games }
}

/** Compares two secrets without leaking where they first differ. */
export function sameSecret(given: string | null, expected: string): boolean {
  const a = new TextEncoder().encode(given ?? '')
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++)
    diff |= (a[i] ?? 0) ^ b[i]
  return given !== null && expected.length > 0 && diff === 0
}

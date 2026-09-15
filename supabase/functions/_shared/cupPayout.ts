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

/** The note on each prize transaction: tells the winner what it is and makes each one unique. */
export function payoutNote(prize: { day: string; gameId: string; rank: number }): string {
  return `Nimcade Daily Cup ${prize.day} ${prize.gameId} #${prize.rank}`
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

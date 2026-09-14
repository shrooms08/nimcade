/**
 * The Daily Cup score message, shared by the client (which asks the wallet to sign it) and
 * the submit-score Edge Function (which rebuilds and verifies it). No runtime imports, so it
 * runs unchanged in the browser, in the unit tests and in Deno.
 */

export const CUP_GAME_IDS = ['nimnom', 'build-up', 'void-run', 'dodge', 'tap-speed'] as const
export type CupGameId = (typeof CUP_GAME_IDS)[number]

/** Scores must stay below this. */
export const MAX_SCORE = 10_000_000

export const isCupGameId = (value: unknown): value is CupGameId =>
  typeof value === 'string' && (CUP_GAME_IDS as readonly string[]).includes(value)

/** A UTC calendar day as YYYY-MM-DD. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/** The exact text the wallet signs for one score entry. */
export function buildScoreMessage(entry: { gameId: string; day: string; score: number; deviceId: string }): string {
  return `nimcade|${entry.gameId}|${entry.day}|${entry.score}|${entry.deviceId}`
}

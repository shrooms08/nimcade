import { formatAddress, isNimiqAddress } from './nimiqRpc.ts'
import type { RpcTransaction } from './nimiqRpc.ts'
import { isCupGameId, utcDay } from './scoreMessage.ts'

/** Share of every tip added to that game's Daily Cup pool for the day it is recorded. */
export const TIP_POOL_SHARE_PERCENT = 30
/** A first look, then up to 5 retries 3 s apart: 15 s before answering "pending". */
export const TIP_LOOKUPS = 6
export const TIP_LOOKUP_DELAY_MS = 3000
/** Older transfers to the maker can't be recorded as new tips (and fill today's pool). */
export const MAX_TIP_AGE_MS = 60 * 60 * 1000

/** 30% of a tip, in whole Luna (rounded down). BigInt keeps large amounts exact. */
export function poolShareLuna(amountLuna: number): number {
  return Number((BigInt(amountLuna) * BigInt(TIP_POOL_SHARE_PERCENT)) / 100n)
}

export interface TipRow {
  gameId: string
  day: string
  txHash: string
  fromWallet: string
  toWallet: string
  amountLuna: number
  poolShareLuna: number
}

export interface RecordTipDeps {
  getTransaction: (hash: string) => Promise<RpcTransaction | null>
  /** Inserts the tip and adds its share to the pool; recorded is false when the hash was already there. */
  recordTip: (row: TipRow) => Promise<{ recorded: boolean; poolLuna: number | null }>
  sleep: (ms: number) => Promise<void>
  now: () => Date
  /** Addresses tips may go to (the makers), in any spacing or case. */
  makerAddresses: string[]
}

export type RecordTipBody =
  | { ok: true; recorded: boolean; poolLuna: number | null }
  | { ok: false; pending: true }
  | { ok: false; error: string }

export interface RecordTipResult { status: number; body: RecordTipBody }

const fail = (status: number, error: string): RecordTipResult => ({ status, body: { ok: false, error } })

/** Looks the hash up until it is in a block; null after every lookup came back empty or failed. */
export async function waitForTransaction(hash: string, deps: Pick<RecordTipDeps, 'getTransaction' | 'sleep'>): Promise<RpcTransaction | null> {
  for (let lookup = 0; lookup < TIP_LOOKUPS; lookup++) {
    if (lookup > 0)
      await deps.sleep(TIP_LOOKUP_DELAY_MS)
    try {
      const tx = await deps.getTransaction(hash)
      if (tx)
        return tx
    }
    catch {
      // A flaky RPC server counts as "not seen yet"; the next lookup tries again.
    }
  }
  return null
}

/** Validates a tip report, checks it against the chain and records it. */
export async function handleTip(input: unknown, deps: RecordTipDeps): Promise<RecordTipResult> {
  if (input === null || typeof input !== 'object')
    return fail(400, 'Expected a JSON object.')
  const { gameId, txHash, fromWallet, toWallet, amountLuna } = input as Record<string, unknown>
  if (!isCupGameId(gameId))
    return fail(400, 'Unknown game.')
  if (typeof txHash !== 'string' || !/^[0-9a-f]{64}$/i.test(txHash))
    return fail(400, 'Invalid transaction hash.')
  if (!isNimiqAddress(fromWallet) || !isNimiqAddress(toWallet))
    return fail(400, 'Invalid wallet address.')
  if (typeof amountLuna !== 'number' || !Number.isSafeInteger(amountLuna) || amountLuna <= 0)
    return fail(400, 'Invalid amount.')

  const from = formatAddress(fromWallet)
  const to = formatAddress(toWallet)
  if (!deps.makerAddresses.some(maker => isNimiqAddress(maker) && formatAddress(maker) === to))
    return fail(400, "Tips go to the game's maker.")
  if (from === to)
    return fail(400, 'A tip needs a different sender and recipient.')

  const hash = txHash.toLowerCase()
  const tx = await waitForTransaction(hash, deps)
  if (!tx)
    return { status: 202, body: { ok: false, pending: true } }
  if (!isNimiqAddress(tx.from) || !isNimiqAddress(tx.to) || formatAddress(tx.from) !== from || formatAddress(tx.to) !== to || Number(tx.value) !== amountLuna)
    return fail(400, 'The transaction does not match this tip.')
  if (tx.executionResult === false)
    return fail(400, 'The transaction failed on chain.')
  const now = deps.now()
  if (typeof tx.timestamp === 'number' && now.getTime() - tx.timestamp > MAX_TIP_AGE_MS)
    return fail(400, 'The transaction is too old to record as a tip.')

  const result = await deps.recordTip({ gameId, day: utcDay(now), txHash: hash, fromWallet: from, toWallet: to, amountLuna, poolShareLuna: poolShareLuna(amountLuna) })
  return { status: 200, body: { ok: true, ...result } }
}

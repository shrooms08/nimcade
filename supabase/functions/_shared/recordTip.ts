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
/**
 * Nimiq Pay pays through a one-off HTLC: the wallet funds it, then the HTLC sends the payment
 * and returns the change. Such a transaction's sender is the HTLC, not the wallet.
 */
export const HTLC_ACCOUNT_TYPE = 2
/** How far back in the HTLC's history to look for the wallet's funding transaction. */
const FUNDING_LOOKBACK = 10
/** A serialized basic transaction is a few hundred bytes; much longer input isn't one. */
const MAX_SERIALIZED_HEX = 4096

/** 30% of a tip, in whole Luna (rounded down). BigInt keeps large amounts exact. */
export function poolShareLuna(amountLuna: number): number {
  return Number((BigInt(amountLuna) * BigInt(TIP_POOL_SHARE_PERCENT)) / 100n)
}

export type TipTxRef = { kind: 'hash'; hash: string } | { kind: 'serialized'; hex: string }

/**
 * Reads what the wallet returned for the tip. The provider docs say sendBasicTransaction returns
 * the transaction hash; the SDK's type comment says the serialized transaction. Either is
 * accepted, trimmed, with or without 0x, in any case. The RPC server only parses bare hex.
 */
export function normalizeTxHash(value: unknown): TipTxRef | null {
  if (typeof value !== 'string')
    return null
  const hex = value.trim().replace(/^0x/i, '').toLowerCase()
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0)
    return null
  if (hex.length === 64)
    return { kind: 'hash', hash: hex }
  return hex.length > 64 && hex.length <= MAX_SERIALIZED_HEX ? { kind: 'serialized', hex } : null
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

/** Structured log lines: 'tip' on entry, 'lookup' per RPC attempt, 'decision' for the outcome. */
export type TipLog = (event: 'tip' | 'lookup' | 'decision', fields: Record<string, unknown>) => void

export interface RecordTipDeps {
  getTransaction: (hash: string) => Promise<RpcTransaction | null>
  getTransactionsByAddress: (address: string, max: number) => Promise<RpcTransaction[]>
  /** The hash of a serialized transaction (hex); throws when it isn't one. */
  hashOfSerialized: (hex: string) => string
  /** Inserts the tip and adds its share to the pool; recorded is false when the hash was already there. */
  recordTip: (row: TipRow) => Promise<{ recorded: boolean; poolLuna: number | null }>
  sleep: (ms: number) => Promise<void>
  now: () => Date
  /** Addresses tips may go to (the makers), in any spacing or case. */
  makerAddresses: string[]
  /** For the logs: the RPC server in use (origin only). */
  rpcUrl: string
  log?: TipLog
}

export type RecordTipBody =
  | { ok: true; recorded: boolean; poolLuna: number | null }
  | { ok: false; pending: true }
  | { ok: false; error: string }

export interface RecordTipResult { status: number; body: RecordTipBody }

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200)
const PENDING: RecordTipResult = { status: 202, body: { ok: false, pending: true } }

/** Looks the hash up until it is in a block; null after every lookup came back empty or failed. */
export async function waitForTransaction(hash: string, deps: Pick<RecordTipDeps, 'getTransaction' | 'sleep' | 'log'>): Promise<RpcTransaction | null> {
  for (let attempt = 1; attempt <= TIP_LOOKUPS; attempt++) {
    if (attempt > 1)
      await deps.sleep(TIP_LOOKUP_DELAY_MS)
    try {
      const tx = await deps.getTransaction(hash)
      deps.log?.('lookup', tx ? { attempt, result: 'found', blockNumber: tx.blockNumber } : { attempt, result: 'not found' })
      if (tx)
        return tx
    }
    catch (error) {
      // A flaky RPC server counts as "not seen yet"; the next lookup tries again.
      deps.log?.('lookup', { attempt, result: 'error', error: errorText(error) })
    }
  }
  return null
}

/** Whether `from` sent the transaction: directly, or through an HTLC it funded. */
async function sentBy(tx: RpcTransaction, from: string, deps: RecordTipDeps): Promise<boolean> {
  if (formatAddress(tx.from) === from)
    return true
  if (tx.fromType !== HTLC_ACCOUNT_TYPE)
    return false
  const htlc = formatAddress(tx.from)
  const history = await deps.getTransactionsByAddress(htlc, FUNDING_LOOKBACK)
  return history.some(funding => isNimiqAddress(funding.from) && isNimiqAddress(funding.to)
    && formatAddress(funding.to) === htlc && formatAddress(funding.from) === from && funding.executionResult !== false)
}

/** Validates a tip report, checks it against the chain and records it. */
export async function handleTip(input: unknown, deps: RecordTipDeps): Promise<RecordTipResult> {
  const log: TipLog = deps.log ?? (() => {})
  const reject = (error: string, fields: Record<string, unknown> = {}): RecordTipResult => {
    log('decision', { outcome: 'rejected', status: 400, reason: error, ...fields })
    return { status: 400, body: { ok: false, error } }
  }
  if (input === null || typeof input !== 'object')
    return reject('Expected a JSON object.')
  const { gameId, txHash, fromWallet, toWallet, amountLuna } = input as Record<string, unknown>
  log('tip', {
    gameId,
    txHash: typeof txHash === 'string' ? txHash.slice(0, 140) : typeof txHash,
    txHashLength: typeof txHash === 'string' ? txHash.length : null,
    amountLuna,
    rpcUrl: deps.rpcUrl,
  })

  if (!isCupGameId(gameId))
    return reject('Unknown game.')
  const ref = normalizeTxHash(txHash)
  if (!ref)
    return reject('Invalid transaction hash.')
  let hash: string
  try {
    hash = ref.kind === 'hash' ? ref.hash : deps.hashOfSerialized(ref.hex).toLowerCase()
  }
  catch (error) {
    return reject('Invalid transaction hash.', { detail: `not a serialized transaction: ${errorText(error)}` })
  }
  if (!isNimiqAddress(fromWallet) || !isNimiqAddress(toWallet))
    return reject('Invalid wallet address.', { hash })
  if (typeof amountLuna !== 'number' || !Number.isSafeInteger(amountLuna) || amountLuna <= 0)
    return reject('Invalid amount.', { hash })

  const from = formatAddress(fromWallet)
  const to = formatAddress(toWallet)
  if (!deps.makerAddresses.some(maker => isNimiqAddress(maker) && formatAddress(maker) === to))
    return reject("Tips go to the game's maker.", { hash, toWallet: to })

  const tx = await waitForTransaction(hash, { ...deps, log })
  if (!tx) {
    log('decision', { outcome: 'pending', status: 202, hash, reason: `not in a block after ${TIP_LOOKUPS} lookups` })
    return PENDING
  }
  const mismatch = 'The transaction does not match this tip.'
  if (!isNimiqAddress(tx.to) || formatAddress(tx.to) !== to)
    return reject(mismatch, { hash, field: 'recipient', expected: to, actual: tx.to })
  if (Number(tx.value) !== amountLuna)
    return reject(mismatch, { hash, field: 'value', expected: amountLuna, actual: tx.value })
  let senderOk: boolean
  try {
    senderOk = isNimiqAddress(tx.from) && await sentBy(tx, from, deps)
  }
  catch (error) {
    log('decision', { outcome: 'pending', status: 202, hash, reason: `sender check failed: ${errorText(error)}` })
    return PENDING
  }
  if (!senderOk)
    return reject(mismatch, { hash, field: 'sender', expected: from, actual: tx.from, fromType: tx.fromType })
  if (tx.executionResult === false)
    return reject('The transaction failed on chain.', { hash })
  const now = deps.now()
  if (typeof tx.timestamp === 'number' && now.getTime() - tx.timestamp > MAX_TIP_AGE_MS)
    return reject('The transaction is too old to record as a tip.', { hash, timestamp: tx.timestamp })

  const result = await deps.recordTip({ gameId, day: utcDay(now), txHash: hash, fromWallet: from, toWallet: to, amountLuna, poolShareLuna: poolShareLuna(amountLuna) })
  log('decision', { outcome: 'recorded', status: 200, hash, replay: !result.recorded, poolLuna: result.poolLuna })
  return { status: 200, body: { ok: true, ...result } }
}

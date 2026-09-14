import { supabase } from './supabase'

/**
 * Reports a sent tip to the record-tip Edge Function, which checks it on chain, stores it once
 * and adds 30% to today's Cup pool. Runs in the background after the tip sheet closes.
 */

export interface TipReport {
  gameId: string
  txHash: string
  fromWallet: string
  toWallet: string
  amountLuna: number
}

export type TipRecordOutcome = 'recorded' | 'pending' | 'failed'

/** The function already waits 15 s for the block; if it's still pending, ask once more after this. */
export const TIP_RECORD_RETRY_MS = 10_000

export interface TipRecordDeps {
  post: (tip: TipReport) => Promise<unknown>
  wait: (ms: number) => Promise<void>
}

async function post(tip: TipReport): Promise<unknown> {
  if (!supabase)
    throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('record-tip', { body: tip })
  if (error)
    throw error
  return data
}

const wait = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms))

async function attempt(tip: TipReport, send: TipRecordDeps['post']): Promise<TipRecordOutcome> {
  try {
    const body = await send(tip) as { ok?: boolean; pending?: boolean } | null
    return body?.ok ? 'recorded' : body?.pending ? 'pending' : 'failed'
  }
  catch {
    return 'failed'
  }
}

/** Records a tip; when the chain hasn't included it yet, retries once after 10 s. */
export async function recordTip(tip: TipReport, deps: Partial<TipRecordDeps> = {}): Promise<TipRecordOutcome> {
  const send = deps.post ?? post
  const first = await attempt(tip, send)
  if (first !== 'pending')
    return first
  await (deps.wait ?? wait)(TIP_RECORD_RETRY_MS)
  return attempt(tip, send)
}

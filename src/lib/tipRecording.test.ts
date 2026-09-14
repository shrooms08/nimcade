import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNimiqRpc, formatAddress } from '../../supabase/functions/_shared/nimiqRpc.ts'
import type { RpcTransaction } from '../../supabase/functions/_shared/nimiqRpc.ts'
import { handleTip, MAX_TIP_AGE_MS, poolShareLuna, TIP_LOOKUP_DELAY_MS, TIP_LOOKUPS } from '../../supabase/functions/_shared/recordTip.ts'
import type { RecordTipDeps, TipRow } from '../../supabase/functions/_shared/recordTip.ts'
import { recordTip, TIP_RECORD_RETRY_MS } from './tipRecord'

const MAKER = 'NQ41 SNGM 484K V3E2 H52K 07YG S6XK XJ8N T1XQ'
const PLAYER = 'NQ35 YFBF ES7X R9PS 36R4 11FG 3HQF YL9Q NL2S'
const OTHER = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
const HASH = 'ab'.repeat(32)
const NOW = new Date('2026-09-14T15:00:00Z')

const report = (overrides: Record<string, unknown> = {}) =>
  ({ gameId: 'dodge', txHash: HASH.toUpperCase(), fromWallet: PLAYER.replace(/ /g, '').toLowerCase(), toWallet: MAKER, amountLuna: 500_000, ...overrides })

const mined = (overrides: Partial<RpcTransaction> = {}): RpcTransaction =>
  ({ hash: HASH, blockNumber: 11_435_174, timestamp: NOW.getTime() - 20_000, from: PLAYER, to: MAKER, value: 500_000, executionResult: true, ...overrides })

/** Each lookup returns the next item (the last one repeats); an Error is thrown. */
function deps(lookups: (RpcTransaction | null | Error)[], recorded = true) {
  let call = 0
  const getTransaction = vi.fn(async (_hash: string) => {
    const next = lookups[Math.min(call++, lookups.length - 1)]
    if (next instanceof Error)
      throw next
    return next
  })
  const sleep = vi.fn(async (_ms: number) => {})
  const store = vi.fn(async (_row: TipRow) => (recorded ? { recorded: true, poolLuna: 150_000 } : { recorded: false, poolLuna: null }))
  const all: RecordTipDeps = { getTransaction, sleep, recordTip: store, now: () => NOW, makerAddresses: [MAKER.replace(/ /g, '')] }
  return { all, getTransaction, sleep, store }
}

describe('tip pool share', () => {
  it('adds 30% of the tip, in whole Luna', () => {
    expect(poolShareLuna(100_000)).toBe(30_000)
    expect(poolShareLuna(500_000)).toBe(150_000)
    expect(poolShareLuna(7)).toBe(2)
    expect(poolShareLuna(2_100_000_000_000_000)).toBe(630_000_000_000_000)
  })
})

describe('record-tip', () => {
  it('records a mined tip that matches, with the pool share for today (UTC)', async () => {
    const d = deps([mined()])
    expect(await handleTip(report(), d.all)).toEqual({ status: 200, body: { ok: true, recorded: true, poolLuna: 150_000 } })
    expect(d.store).toHaveBeenCalledWith({ gameId: 'dodge', day: '2026-09-14', txHash: HASH, fromWallet: PLAYER, toWallet: MAKER, amountLuna: 500_000, poolShareLuna: 150_000 })
    expect(d.getTransaction).toHaveBeenCalledWith(HASH)
    expect(d.sleep).not.toHaveBeenCalled()
  })

  it('retries 5 times over 15 seconds, then answers pending without recording', async () => {
    const d = deps([null])
    expect(await handleTip(report(), d.all)).toEqual({ status: 202, body: { ok: false, pending: true } })
    expect(TIP_LOOKUPS).toBe(6)
    expect(d.getTransaction).toHaveBeenCalledTimes(6)
    expect(d.sleep).toHaveBeenCalledTimes(5)
    expect(d.sleep.mock.calls.every(([ms]) => ms === TIP_LOOKUP_DELAY_MS)).toBe(true)
    expect(d.sleep.mock.calls.reduce((total, [ms]) => total + ms, 0)).toBe(15_000)
    expect(d.store).not.toHaveBeenCalled()
  })

  it('keeps looking through RPC errors and stops as soon as the block has it', async () => {
    const d = deps([null, new Error('HTTP 502'), mined()])
    expect((await handleTip(report(), d.all)).status).toBe(200)
    expect(d.getTransaction).toHaveBeenCalledTimes(3)
    expect(d.sleep).toHaveBeenCalledTimes(2)
  })

  it('refuses a transaction that does not match the tip', async () => {
    const mismatch = { status: 400, body: { ok: false, error: 'The transaction does not match this tip.' } }
    expect(await handleTip(report(), deps([mined({ value: 499_999 })]).all)).toEqual(mismatch)
    expect(await handleTip(report(), deps([mined({ from: OTHER })]).all)).toEqual(mismatch)
    expect(await handleTip(report(), deps([mined({ to: OTHER })]).all)).toEqual(mismatch)
    expect((await handleTip(report(), deps([mined({ executionResult: false })]).all)).status).toBe(400)
    expect((await handleTip(report(), deps([mined({ timestamp: NOW.getTime() - MAX_TIP_AGE_MS - 1 })]).all)).status).toBe(400)
  })

  it('only counts tips to the maker, from someone else, without asking the chain otherwise', async () => {
    const d = deps([mined()])
    expect(await handleTip(report({ toWallet: OTHER }), d.all)).toEqual({ status: 400, body: { ok: false, error: "Tips go to the game's maker." } })
    expect((await handleTip(report({ fromWallet: MAKER }), d.all)).status).toBe(400)
    expect(d.getTransaction).not.toHaveBeenCalled()
  })

  it('treats a replayed hash as a no-op', async () => {
    const d = deps([mined()], false)
    expect(await handleTip(report(), d.all)).toEqual({ status: 200, body: { ok: true, recorded: false, poolLuna: null } })
  })

  it('validates the report', async () => {
    const status = async (overrides: Record<string, unknown>) => (await handleTip(report(overrides), deps([mined()]).all)).status
    expect(await status({ gameId: 'dot-rush' })).toBe(400)
    expect(await status({ txHash: 'abc' })).toBe(400)
    expect(await status({ fromWallet: 'NQ12 nope' })).toBe(400)
    expect(await status({ amountLuna: 0 })).toBe(400)
    expect(await status({ amountLuna: 1.5 })).toBe(400)
    expect(await status({ amountLuna: '500000' })).toBe(400)
    expect((await handleTip(null, deps([mined()]).all)).status).toBe(400)
  })
})

describe('Nimiq RPC client', () => {
  const server = (json: unknown, ok = true) => vi.fn(async (_url: string, _init: { body: string }) => ({ ok, status: ok ? 200 : 502, json: async () => json }))

  it('unwraps { data } results and posts JSON-RPC 2.0', async () => {
    const fetchFn = server({ jsonrpc: '2.0', result: { data: mined(), metadata: null }, id: 1 })
    expect(await createNimiqRpc('https://rpc.test', fetchFn).getTransaction(HASH)).toEqual(mined())
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ jsonrpc: '2.0', id: 1, method: 'getTransactionByHash', params: [HASH] })
    expect(await createNimiqRpc('https://rpc.test', server({ result: { data: 11_435_174, metadata: null } })).getBlockNumber()).toBe(11_435_174)
  })

  it('reads "not found" and a transaction without a block as not yet mined', async () => {
    const notFound = server({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error', data: `Transaction not found: ${HASH}` }, id: 1 })
    expect(await createNimiqRpc('https://rpc.test', notFound).getTransaction(HASH)).toBeNull()
    expect(await createNimiqRpc('https://rpc.test', server({ result: { data: mined({ blockNumber: undefined }) } })).getTransaction(HASH)).toBeNull()
    await expect(createNimiqRpc('https://rpc.test', server({ error: 'Method not allowed' })).getTransaction(HASH)).rejects.toThrow('Method not allowed')
    await expect(createNimiqRpc('https://rpc.test', server({}, false)).getBlockNumber()).rejects.toThrow('HTTP 502')
  })

  it('formats addresses the way the app stores them', () => {
    expect(formatAddress('nq41sngm484kv3e2h52k07ygs6xkxj8nt1xq')).toBe(MAKER)
  })
})

describe('recording a tip from the app', () => {
  const tip = { gameId: 'dodge', txHash: HASH, fromWallet: PLAYER, toWallet: MAKER, amountLuna: 500_000 }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries once, 10 seconds after a pending answer', async () => {
    vi.useFakeTimers()
    const post = vi.fn().mockResolvedValueOnce({ ok: false, pending: true }).mockResolvedValueOnce({ ok: true, recorded: true })
    const outcome = recordTip(tip, { post })
    await vi.advanceTimersByTimeAsync(TIP_RECORD_RETRY_MS - 1)
    expect(post).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(post).toHaveBeenCalledTimes(2)
    expect(await outcome).toBe('recorded')
    expect(TIP_RECORD_RETRY_MS).toBe(10_000)
  })

  it('gives up after the one retry', async () => {
    const post = vi.fn(async () => ({ ok: false, pending: true }))
    const wait = vi.fn(async (_ms: number) => {})
    expect(await recordTip(tip, { post, wait })).toBe('pending')
    expect(post).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledOnce()
  })

  it('does not retry a recorded tip, a refusal or a network error', async () => {
    const wait = vi.fn(async (_ms: number) => {})
    expect(await recordTip(tip, { post: async () => ({ ok: true, recorded: false }), wait })).toBe('recorded')
    expect(await recordTip(tip, { post: async () => ({ ok: false, error: 'nope' }), wait })).toBe('failed')
    expect(await recordTip(tip, { post: async () => { throw new Error('offline') }, wait })).toBe('failed')
    expect(wait).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNimiqRpc, formatAddress } from '../../supabase/functions/_shared/nimiqRpc.ts'
import type { RpcTransaction } from '../../supabase/functions/_shared/nimiqRpc.ts'
import { handleTip, MAX_TIP_AGE_MS, normalizeTxHash, poolShareLuna, TIP_LOOKUP_DELAY_MS, TIP_LOOKUPS } from '../../supabase/functions/_shared/recordTip.ts'
import type { RecordTipDeps, TipRow } from '../../supabase/functions/_shared/recordTip.ts'
import { recordTip, TIP_RECORD_RETRY_MS } from './tipRecord'

const MAKER = 'NQ41 SNGM 484K V3E2 H52K 07YG S6XK XJ8N T1XQ'
const PLAYER = 'NQ35 YFBF ES7X R9PS 36R4 11FG 3HQF YL9Q NL2S'
const OTHER = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
const HTLC = 'NQ65 0F35 E5U6 EFGH 7FBH 5CA2 KJ23 5NSR 46YF'
const HASH = 'ab'.repeat(32)
const SERIALIZED = 'cd'.repeat(133)
const RPC = 'https://rpc.testnet.nimiqwatch.com'
const NOW = new Date('2026-09-14T15:00:00Z')

const report = (overrides: Record<string, unknown> = {}) =>
  ({ gameId: 'dodge', txHash: HASH.toUpperCase(), fromWallet: PLAYER.replace(/ /g, '').toLowerCase(), toWallet: MAKER, amountLuna: 500_000, ...overrides })

const mined = (overrides: Partial<RpcTransaction> = {}): RpcTransaction =>
  ({ hash: HASH, blockNumber: 11_435_174, timestamp: NOW.getTime() - 20_000, from: PLAYER, fromType: 0, to: MAKER, value: 500_000, executionResult: true, ...overrides })

/** Each lookup returns the next item (the last one repeats); an Error is thrown. */
function deps(lookups: (RpcTransaction | null | Error)[], options: { recorded?: boolean; history?: RpcTransaction[] } = {}) {
  let call = 0
  const getTransaction = vi.fn(async (_hash: string) => {
    const next = lookups[Math.min(call++, lookups.length - 1)]
    if (next instanceof Error)
      throw next
    return next
  })
  const getTransactionsByAddress = vi.fn(async (_address: string, _max: number) => options.history ?? [])
  const hashOfSerialized = vi.fn((_hex: string) => HASH.toUpperCase())
  const sleep = vi.fn(async (_ms: number) => {})
  const log = vi.fn((_event: string, _fields: Record<string, unknown>) => {})
  const store = vi.fn(async (_row: TipRow) => (options.recorded === false ? { recorded: false, poolLuna: null } : { recorded: true, poolLuna: 150_000 }))
  const all: RecordTipDeps = { getTransaction, getTransactionsByAddress, hashOfSerialized, sleep, log, recordTip: store, now: () => NOW, makerAddresses: [MAKER.replace(/ /g, '')], rpcUrl: RPC }
  return { all, getTransaction, getTransactionsByAddress, hashOfSerialized, sleep, log, store }
}

const decision = (log: ReturnType<typeof deps>['log']) => log.mock.calls.filter(([event]) => event === 'decision').map(([, fields]) => fields)

describe('tip pool share', () => {
  it('adds 30% of the tip, in whole Luna', () => {
    expect(poolShareLuna(100_000)).toBe(30_000)
    expect(poolShareLuna(500_000)).toBe(150_000)
    expect(poolShareLuna(7)).toBe(2)
    expect(poolShareLuna(2_100_000_000_000_000)).toBe(630_000_000_000_000)
  })
})

describe('transaction hash normalization', () => {
  it('reads a hash in any case, with or without 0x and whitespace, as bare lowercase hex', () => {
    for (const input of [HASH, HASH.toUpperCase(), `0x${HASH}`, `0X${HASH.toUpperCase()}`, `  0x${HASH}\n`])
      expect(normalizeTxHash(input)).toEqual({ kind: 'hash', hash: HASH })
  })

  it('reads a longer hex string as a serialized transaction', () => {
    expect(normalizeTxHash(SERIALIZED.toUpperCase())).toEqual({ kind: 'serialized', hex: SERIALIZED })
    expect(normalizeTxHash(`0x${SERIALIZED}`)).toEqual({ kind: 'serialized', hex: SERIALIZED })
  })

  it('refuses anything else', () => {
    for (const input of ['', '0x', 'abc', 'ab'.repeat(31), 'zz'.repeat(32), `${HASH} ${HASH}`, 'ab'.repeat(2049), 123, null, undefined, { hash: HASH }])
      expect(normalizeTxHash(input)).toBeNull()
  })
})

describe('record-tip', () => {
  it('records a mined tip that matches, with the pool share for today (UTC), and logs each step', async () => {
    const d = deps([mined()])
    expect(await handleTip(report(), d.all)).toEqual({ status: 200, body: { ok: true, recorded: true, poolLuna: 150_000 } })
    expect(d.store).toHaveBeenCalledWith({ gameId: 'dodge', day: '2026-09-14', txHash: HASH, fromWallet: PLAYER, toWallet: MAKER, amountLuna: 500_000, poolShareLuna: 150_000 })
    expect(d.getTransaction).toHaveBeenCalledWith(HASH)
    expect(d.sleep).not.toHaveBeenCalled()
    expect(d.log.mock.calls).toEqual([
      ['tip', { gameId: 'dodge', txHash: HASH.toUpperCase(), txHashLength: 64, amountLuna: 500_000, rpcUrl: RPC }],
      ['lookup', { attempt: 1, result: 'found', blockNumber: 11_435_174 }],
      ['decision', { outcome: 'recorded', status: 200, hash: HASH, replay: false, poolLuna: 150_000 }],
    ])
  })

  it('looks up the hash of a serialized transaction', async () => {
    const d = deps([mined()])
    expect((await handleTip(report({ txHash: `0x${SERIALIZED.toUpperCase()}` }), d.all)).status).toBe(200)
    expect(d.hashOfSerialized).toHaveBeenCalledWith(SERIALIZED)
    expect(d.getTransaction).toHaveBeenCalledWith(HASH)

    const broken = deps([mined()])
    broken.hashOfSerialized.mockImplementationOnce(() => { throw new Error('unexpected end of input') })
    expect(await handleTip(report({ txHash: SERIALIZED }), broken.all)).toEqual({ status: 400, body: { ok: false, error: 'Invalid transaction hash.' } })
    expect(broken.getTransaction).not.toHaveBeenCalled()
  })

  it('accepts a tip sent through an HTLC the wallet funded (Nimiq Pay), even from the maker itself', async () => {
    const funding = mined({ hash: 'ef'.repeat(32), from: MAKER, fromType: 0, to: HTLC, value: 10_999_999_000 })
    const d = deps([mined({ from: HTLC, fromType: 2 })], { history: [mined({ from: HTLC, fromType: 2 }), funding] })
    expect(await handleTip(report({ fromWallet: MAKER }), d.all)).toEqual({ status: 200, body: { ok: true, recorded: true, poolLuna: 150_000 } })
    expect(d.getTransactionsByAddress).toHaveBeenCalledWith(HTLC, 10)
    expect(d.store.mock.calls[0][0].fromWallet).toBe(MAKER)
  })

  it('refuses an HTLC someone else funded, and a direct transfer from another wallet', async () => {
    const funding = mined({ from: OTHER, to: HTLC })
    const viaHtlc = deps([mined({ from: HTLC, fromType: 2 })], { history: [funding] })
    expect(await handleTip(report(), viaHtlc.all)).toEqual({ status: 400, body: { ok: false, error: 'The transaction does not match this tip.' } })
    expect(decision(viaHtlc.log)).toEqual([{ outcome: 'rejected', status: 400, reason: 'The transaction does not match this tip.', hash: HASH, field: 'sender', expected: PLAYER, actual: HTLC, fromType: 2 }])

    const direct = deps([mined({ from: OTHER })])
    expect((await handleTip(report(), direct.all)).status).toBe(400)
    expect(direct.getTransactionsByAddress).not.toHaveBeenCalled()
  })

  it('retries 5 times over 15 seconds, then answers pending without recording, logging every attempt', async () => {
    const d = deps([null])
    expect(await handleTip(report(), d.all)).toEqual({ status: 202, body: { ok: false, pending: true } })
    expect(TIP_LOOKUPS).toBe(6)
    expect(d.getTransaction).toHaveBeenCalledTimes(6)
    expect(d.sleep).toHaveBeenCalledTimes(5)
    expect(d.sleep.mock.calls.every(([ms]) => ms === TIP_LOOKUP_DELAY_MS)).toBe(true)
    expect(d.sleep.mock.calls.reduce((total, [ms]) => total + ms, 0)).toBe(15_000)
    expect(d.store).not.toHaveBeenCalled()
    expect(d.log.mock.calls.filter(([event]) => event === 'lookup').map(([, fields]) => fields)).toEqual([1, 2, 3, 4, 5, 6].map(attempt => ({ attempt, result: 'not found' })))
    expect(decision(d.log)).toEqual([{ outcome: 'pending', status: 202, hash: HASH, reason: 'not in a block after 6 lookups' }])
  })

  it('keeps looking through RPC errors and stops as soon as the block has it', async () => {
    const d = deps([null, new Error('getTransactionByHash: HTTP 502'), mined()])
    expect((await handleTip(report(), d.all)).status).toBe(200)
    expect(d.getTransaction).toHaveBeenCalledTimes(3)
    expect(d.sleep).toHaveBeenCalledTimes(2)
    expect(d.log.mock.calls[2]).toEqual(['lookup', { attempt: 2, result: 'error', error: 'getTransactionByHash: HTTP 502' }])
  })

  it('refuses a transaction that does not match the tip', async () => {
    const mismatch = { status: 400, body: { ok: false, error: 'The transaction does not match this tip.' } }
    expect(await handleTip(report(), deps([mined({ value: 499_999 })]).all)).toEqual(mismatch)
    expect(await handleTip(report(), deps([mined({ to: OTHER })]).all)).toEqual(mismatch)
    expect((await handleTip(report(), deps([mined({ executionResult: false })]).all)).status).toBe(400)
    expect((await handleTip(report(), deps([mined({ timestamp: NOW.getTime() - MAX_TIP_AGE_MS - 1 })]).all)).status).toBe(400)
  })

  it('only counts tips to the maker, without asking the chain otherwise', async () => {
    const d = deps([mined()])
    expect(await handleTip(report({ toWallet: OTHER }), d.all)).toEqual({ status: 400, body: { ok: false, error: "Tips go to the game's maker." } })
    expect(d.getTransaction).not.toHaveBeenCalled()
    expect(decision(d.log)[0]).toMatchObject({ outcome: 'rejected', reason: "Tips go to the game's maker.", toWallet: OTHER })
  })

  it('treats a replayed hash as a no-op', async () => {
    const d = deps([mined()], { recorded: false })
    expect(await handleTip(report(), d.all)).toEqual({ status: 200, body: { ok: true, recorded: false, poolLuna: null } })
    expect(decision(d.log)[0]).toMatchObject({ outcome: 'recorded', replay: true })
  })

  it('validates the report and logs why it was refused', async () => {
    const status = async (overrides: Record<string, unknown>) => (await handleTip(report(overrides), deps([mined()]).all)).status
    expect(await status({ gameId: 'dot-rush' })).toBe(400)
    expect(await status({ txHash: 'abc' })).toBe(400)
    expect(await status({ fromWallet: 'NQ12 nope' })).toBe(400)
    expect(await status({ amountLuna: 0 })).toBe(400)
    expect(await status({ amountLuna: 1.5 })).toBe(400)
    expect(await status({ amountLuna: '500000' })).toBe(400)
    const d = deps([mined()])
    expect((await handleTip(null, d.all)).status).toBe(400)
    expect(decision(d.log)).toEqual([{ outcome: 'rejected', status: 400, reason: 'Expected a JSON object.' }])
  })
})

describe('Nimiq RPC client', () => {
  const server = (json: unknown, ok = true) => vi.fn(async (_url: string, _init: { body: string }) => ({ ok, status: ok ? 200 : 502, json: async () => json }))

  it('unwraps { data } results and posts JSON-RPC 2.0', async () => {
    const fetchFn = server({ jsonrpc: '2.0', result: { data: mined(), metadata: null }, id: 1 })
    expect(await createNimiqRpc(RPC, fetchFn).getTransaction(HASH)).toEqual(mined())
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ jsonrpc: '2.0', id: 1, method: 'getTransactionByHash', params: [HASH] })
    expect(await createNimiqRpc(RPC, server({ result: { data: 11_435_174, metadata: null } })).getBlockNumber()).toBe(11_435_174)
    const history = server({ result: { data: [mined()], metadata: null } })
    expect(await createNimiqRpc(RPC, history).getTransactionsByAddress(HTLC, 10)).toEqual([mined()])
    expect(JSON.parse(history.mock.calls[0][1].body).params).toEqual([HTLC, 10, null])
  })

  it('reads "not found" and a transaction without a block as not yet mined', async () => {
    const notFound = server({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error', data: `Transaction not found: ${HASH}` }, id: 1 })
    expect(await createNimiqRpc(RPC, notFound).getTransaction(HASH)).toBeNull()
    expect(await createNimiqRpc(RPC, server({ result: { data: mined({ blockNumber: undefined }) } })).getTransaction(HASH)).toBeNull()
    await expect(createNimiqRpc(RPC, server({ error: { code: -32602, message: 'Invalid params', data: 'Could not parse hex string' } })).getTransaction(`0x${HASH}`)).rejects.toThrow('Could not parse hex string')
    await expect(createNimiqRpc(RPC, server({}, false)).getBlockNumber()).rejects.toThrow('HTTP 502')
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

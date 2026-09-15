import { describe, expect, it, vi } from 'vitest'
import { isFinishedDay, PAYOUT_SPLIT_PERCENT, payoutNote, previousUtcDay, sameSecret, splitPool } from '../../supabase/functions/_shared/cupPayout.ts'
import { INSUFFICIENT_BALANCE, isPayoutTransaction, payCups } from '../../supabase/functions/_shared/payCups.ts'
import type { CupRow, PayCupDeps, PayoutRow, PayoutUpdate, Winner } from '../../supabase/functions/_shared/payCups.ts'
import { createPayCupHandler } from '../../supabase/functions/pay-cup/handler.ts'
import { prizeNim } from './cupApi'

const DAY = '2026-09-13'
const HOT = 'NQ41 SNGM 484K V3E2 H52K 07YG S6XK XJ8N T1XQ'
const WINNER = 'NQ35 YFBF ES7X R9PS 36R4 11FG 3HQF YL9Q NL2S'
const winner = (n: number): Winner => ({ wallet: `NQ0${n} WINNER`, name: `player${n}`, score: 1000 - n })
const dueRow = (gameId: string, rank: number, amountLuna: number): PayoutRow => ({ gameId, day: DAY, rank, wallet: `NQ0${rank} WINNER`, name: null, score: 900, amountLuna })

interface FakeOptions {
  send?: (row: PayoutRow) => Promise<string>
  balance?: number | Error
  due?: Record<string, PayoutRow[]>
  /** `${gameId}#${rank}` -> a hash already on chain */
  onChain?: Record<string, string>
}

/** In-memory cups, scores and payouts; claims behave like the SQL (once, only when eligible). */
function fake(cups: Record<string, CupRow | null>, winners: Record<string, Winner[]>, options: FakeOptions = {}) {
  const claimed = new Set<string>()
  const inserted: PayoutRow[] = []
  const marks: [string, number, PayoutUpdate][] = []
  const deps = {
    gameIds: Object.keys(cups).length ? Object.keys(cups) : Object.keys(options.due ?? {}),
    loadCup: vi.fn(async (gameId: string, _day: string) => cups[gameId] ?? null),
    loadWinners: vi.fn(async (gameId: string, _day: string, limit: number) => (winners[gameId] ?? []).slice(0, limit)),
    claimCup: vi.fn(async (gameId: string, _day: string) => {
      const cup = cups[gameId]
      if (!cup || cup.paidAt || claimed.has(gameId) || cup.poolLuna + cup.seedLuna <= 0)
        return null
      claimed.add(gameId)
      return cup.poolLuna + cup.seedLuna
    }),
    insertPayouts: vi.fn(async (rows: PayoutRow[]) => { inserted.push(...rows) }),
    markPayout: vi.fn(async (row: PayoutRow, update: PayoutUpdate) => { marks.push([row.gameId, row.rank, update]) }),
    send: vi.fn(options.send ?? (async (row: PayoutRow) => `hash-${row.gameId}-${row.rank}`)),
    getBalance: vi.fn(async () => {
      if (options.balance instanceof Error)
        throw options.balance
      return options.balance ?? 1_000_000_000_000
    }),
    loadDuePayouts: vi.fn(async (gameId: string, _day: string) => options.due?.[gameId] ?? []),
    claimDuePayout: vi.fn(async (row: PayoutRow) => {
      const key = `due:${row.gameId}#${row.rank}`
      if (claimed.has(key))
        return false
      claimed.add(key)
      return true
    }),
    findPaid: vi.fn(async (row: PayoutRow) => options.onChain?.[`${row.gameId}#${row.rank}`] ?? null),
  } satisfies PayCupDeps
  return { deps, inserted, marks }
}

describe('prize split', () => {
  it('pays 50/30/20 of pool plus seed, rounding each prize down', () => {
    expect(PAYOUT_SPLIT_PERCENT.reduce((a, b) => a + b, 0)).toBe(100)
    expect(splitPool(1_000_000)).toEqual([500_000, 300_000, 200_000])
    expect(splitPool(1_000_001)).toEqual([500_000, 300_000, 200_000])
    expect(splitPool(99)).toEqual([49, 29, 19])
    expect(splitPool(9_000_000_000_000_001)).toEqual([4_500_000_000_000_000, 2_700_000_000_000_000, 1_800_000_000_000_000])
  })

  it('pays only the ranks that exist, and nothing from an empty pool', () => {
    expect(splitPool(10_000_000, 2)).toEqual([5_000_000, 3_000_000])
    expect(splitPool(10_000_000, 0)).toEqual([])
    expect(splitPool(0)).toEqual([0, 0, 0])
    expect(splitPool(-5, 1)).toEqual([0])
  })

  it('shows the same prizes in the app', () => {
    expect([1, 2, 3, 4].map(rank => prizeNim(rank, 1_000_000))).toEqual([5, 3, 2, null])
    expect(prizeNim(1, 125_000_000 + 25_000_000)).toBe(750)
  })

  it('works out which day to pay', () => {
    expect(previousUtcDay(new Date('2026-09-14T00:05:00Z'))).toBe('2026-09-13')
    expect(previousUtcDay(new Date('2026-03-01T00:05:00Z'))).toBe('2026-02-28')
    const now = new Date('2026-09-14T00:05:00Z')
    expect(isFinishedDay('2026-09-13', now)).toBe(true)
    expect(isFinishedDay('2026-09-14', now)).toBe(false)
    expect(isFinishedDay('2026-02-30', now)).toBe(false)
    expect(isFinishedDay('yesterday', now)).toBe(false)
  })
})

describe('pay-cup', () => {
  it('pays the top 3 and records each transaction', async () => {
    const f = fake({ dodge: { poolLuna: 700_000, seedLuna: 300_000, paidAt: null } }, { dodge: [1, 2, 3, 4].map(winner) }, { balance: 5_000_000 })
    const result = await payCups(DAY, f.deps)
    expect(result.balanceLuna).toBe(5_000_000)
    expect(result.games[0]).toMatchObject({ gameId: 'dodge', status: 'paid', totalLuna: 1_000_000, balanceLuna: 5_000_000 })
    expect(result.games[0].payouts).toEqual([
      { rank: 1, wallet: 'NQ01 WINNER', amountLuna: 500_000, status: 'sent', txHash: 'hash-dodge-1' },
      { rank: 2, wallet: 'NQ02 WINNER', amountLuna: 300_000, status: 'sent', txHash: 'hash-dodge-2' },
      { rank: 3, wallet: 'NQ03 WINNER', amountLuna: 200_000, status: 'sent', txHash: 'hash-dodge-3' },
    ])
    expect(f.inserted.map(row => [row.rank, row.name, row.score, row.day])).toEqual([[1, 'player1', 999, DAY], [2, 'player2', 998, DAY], [3, 'player3', 997, DAY]])
    expect(f.marks.map(([, rank, update]) => [rank, update])).toEqual([[1, { status: 'sent', txHash: 'hash-dodge-1' }], [2, { status: 'sent', txHash: 'hash-dodge-2' }], [3, { status: 'sent', txHash: 'hash-dodge-3' }]])
  })

  it('skips paid, empty and unplayed Cups without claiming or sending', async () => {
    const f = fake(
      { 'dodge': { poolLuna: 500, seedLuna: 0, paidAt: '2026-09-14T00:05:00Z' }, 'nimnom': { poolLuna: 0, seedLuna: 0, paidAt: null }, 'build-up': null, 'void-run': { poolLuna: 900, seedLuna: 0, paidAt: null } },
      { 'dodge': [winner(1)], 'nimnom': [winner(1)] },
    )
    const result = await payCups(DAY, f.deps)
    expect(result.games.map(game => [game.gameId, game.status, game.reason])).toEqual([
      ['dodge', 'skipped', 'already paid'],
      ['nimnom', 'skipped', 'empty pool'],
      ['build-up', 'skipped', 'empty pool'],
      ['void-run', 'skipped', 'no scores'],
    ])
    expect(f.deps.claimCup).not.toHaveBeenCalled()
    expect(f.deps.send).not.toHaveBeenCalled()
  })

  it("writes 'due' rows with the send error when sending fails, and still pays the rest", async () => {
    const f = fake({ dodge: { poolLuna: 1_000_000, seedLuna: 0, paidAt: null } }, { dodge: [1, 2, 3].map(winner) }, {
      send: async (row) => {
        if (row.rank === 2)
          throw new Error('sendRawTransaction: invalid transaction')
        return `hash-${row.rank}`
      },
    })
    const game = (await payCups(DAY, f.deps)).games[0]
    expect(game.status).toBe('partly-due')
    expect(game.payouts?.[1]).toEqual({ rank: 2, wallet: 'NQ02 WINNER', amountLuna: 300_000, status: 'due', txHash: null, error: 'sendRawTransaction: invalid transaction' })
    expect(f.marks.map(([, rank, update]) => [rank, update])).toEqual([[1, { status: 'sent', txHash: 'hash-1' }], [2, { status: 'due', reason: 'sendRawTransaction: invalid transaction' }], [3, { status: 'sent', txHash: 'hash-3' }]])
  })

  it('pays fewer winners, never pays a Cup twice, and plans without writing on a dry run', async () => {
    const f = fake({ dodge: { poolLuna: 1_000_000, seedLuna: 0, paidAt: null } }, { dodge: [winner(1), winner(2)] })
    const plan = await payCups(DAY, f.deps, { dryRun: true })
    expect(plan.games[0].status).toBe('planned')
    expect(plan.games[0].payouts?.map(p => p.amountLuna)).toEqual([500_000, 300_000])
    expect(f.deps.claimCup).not.toHaveBeenCalled()
    expect(f.deps.insertPayouts).not.toHaveBeenCalled()

    expect((await payCups(DAY, f.deps)).games[0].payouts?.map(p => p.amountLuna)).toEqual([500_000, 300_000])
    expect((await payCups(DAY, f.deps)).games[0]).toEqual({ gameId: 'dodge', status: 'skipped', reason: 'already paid' })
    expect(f.deps.send).toHaveBeenCalledTimes(2)
  })

  it("keeps going when one game's data can't be read", async () => {
    const f = fake({ 'dodge': { poolLuna: 1_000, seedLuna: 0, paidAt: null }, 'tap-speed': { poolLuna: 1_000, seedLuna: 0, paidAt: null } }, { 'dodge': [winner(1)], 'tap-speed': [winner(1)] })
    f.deps.loadCup.mockRejectedValueOnce(new Error('db timeout'))
    const result = await payCups(DAY, f.deps)
    expect(result.games.map(game => game.status)).toEqual(['error', 'paid'])
  })
})

describe('hot wallet balance guard', () => {
  it("holds a whole game back when the balance can't cover it: every row due, nothing sent", async () => {
    const f = fake({ dodge: { poolLuna: 1_000_000, seedLuna: 0, paidAt: null } }, { dodge: [1, 2, 3].map(winner) }, { balance: 999_999 })
    const result = await payCups(DAY, f.deps)
    expect(result.balanceLuna).toBe(999_999)
    expect(result.games[0]).toMatchObject({ gameId: 'dodge', status: 'due', reason: INSUFFICIENT_BALANCE, totalLuna: 1_000_000, balanceLuna: 999_999 })
    expect(result.games[0].payouts?.map(p => [p.rank, p.status, p.txHash, p.error])).toEqual([[1, 'due', null, INSUFFICIENT_BALANCE], [2, 'due', null, INSUFFICIENT_BALANCE], [3, 'due', null, INSUFFICIENT_BALANCE]])
    expect(f.deps.send).not.toHaveBeenCalled()
    expect(f.inserted).toHaveLength(3)
    expect(f.marks.map(([, rank, update]) => [rank, update])).toEqual([1, 2, 3].map(rank => [rank, { status: 'due', reason: INSUFFICIENT_BALANCE }]))
  })

  it('draws the balance down game by game within one run', async () => {
    const f = fake(
      { 'dodge': { poolLuna: 1_000_000, seedLuna: 0, paidAt: null }, 'nimnom': { poolLuna: 1_000_000, seedLuna: 0, paidAt: null }, 'tap-speed': { poolLuna: 400_000, seedLuna: 0, paidAt: null } },
      { 'dodge': [1, 2, 3].map(winner), 'nimnom': [1, 2, 3].map(winner), 'tap-speed': [1, 2, 3].map(winner) },
      { balance: 1_500_000 },
    )
    const result = await payCups(DAY, f.deps)
    expect(result.games.map(game => [game.gameId, game.status, game.balanceLuna])).toEqual([['dodge', 'paid', 1_500_000], ['nimnom', 'due', 500_000], ['tap-speed', 'paid', 500_000]])
    expect(f.deps.getBalance).toHaveBeenCalledOnce()
  })

  it("claims nothing when the balance can't be read; a dry run plans without it", async () => {
    const f = fake({ dodge: { poolLuna: 1_000_000, seedLuna: 0, paidAt: null } }, { dodge: [winner(1)] }, { balance: new Error('getAccountByAddress: HTTP 502') })
    await expect(payCups(DAY, f.deps)).rejects.toThrow('Could not read the hot wallet balance: getAccountByAddress: HTTP 502')
    expect(f.deps.claimCup).not.toHaveBeenCalled()
    const plan = await payCups(DAY, f.deps, { dryRun: true })
    expect(plan).toMatchObject({ balanceLuna: null, games: [{ status: 'planned', balanceLuna: null }] })
  })

  it('reports on a dry run which games the balance would not cover', async () => {
    const f = fake({ dodge: { poolLuna: 1_000_000, seedLuna: 0, paidAt: null } }, { dodge: [winner(1)] }, { balance: 100 })
    expect((await payCups(DAY, f.deps, { dryRun: true })).games[0]).toMatchObject({ status: 'planned', reason: INSUFFICIENT_BALANCE, balanceLuna: 100 })
  })
})

describe('retryDue', () => {
  it('re-sends due rows, and records a prize already on chain instead of paying it twice', async () => {
    const f = fake({}, {}, { due: { dodge: [dueRow('dodge', 1, 500_000), dueRow('dodge', 2, 300_000)] }, onChain: { 'dodge#1': 'hash-found' }, balance: 300_000 })
    const result = await payCups(DAY, f.deps, { retryDue: true })
    expect(result.games[0]).toMatchObject({ gameId: 'dodge', status: 'paid', totalLuna: 800_000 })
    expect(result.games[0].payouts?.map(p => [p.rank, p.status, p.txHash])).toEqual([[1, 'sent', 'hash-found'], [2, 'sent', 'hash-dodge-2']])
    expect(f.deps.send).toHaveBeenCalledOnce()
    expect(f.marks.map(([, rank, update]) => [rank, update])).toEqual([[1, { status: 'sent', txHash: 'hash-found' }], [2, { status: 'sent', txHash: 'hash-dodge-2' }]])
    expect(f.deps.claimCup).not.toHaveBeenCalled()
  })

  it('keeps rows due, all or none, when the balance is still short', async () => {
    const f = fake({}, {}, { due: { dodge: [dueRow('dodge', 1, 500_000), dueRow('dodge', 2, 300_000)] }, balance: 799_999 })
    const game = (await payCups(DAY, f.deps, { retryDue: true })).games[0]
    expect(game).toMatchObject({ status: 'due', reason: INSUFFICIENT_BALANCE, balanceLuna: 799_999 })
    expect(f.deps.claimDuePayout).not.toHaveBeenCalled()
    expect(f.deps.send).not.toHaveBeenCalled()
  })

  it("skips games with nothing due, rows another retry claimed, and doesn't resend when the chain can't be checked", async () => {
    const f = fake({}, {}, { due: { 'dodge': [dueRow('dodge', 1, 500_000)], 'nimnom': [dueRow('nimnom', 1, 100)], 'tap-speed': [] } })
    f.deps.findPaid.mockRejectedValueOnce(new Error('RPC down'))
    await f.deps.claimDuePayout(dueRow('nimnom', 1, 100)) // another retry got there first
    const result = await payCups(DAY, f.deps, { retryDue: true })
    expect(result.games.map(game => [game.gameId, game.status, game.reason])).toEqual([['dodge', 'due', undefined], ['nimnom', 'skipped', 'already being retried'], ['tap-speed', 'skipped', 'nothing due']])
    expect(result.games[0].payouts?.[0].error).toBe('could not check earlier attempts: RPC down')
    expect(f.deps.send).not.toHaveBeenCalled()
  })

  it('recognises a prize transaction by recipient, value and note', () => {
    const row = { ...dueRow('dodge', 1, 500_000), wallet: WINNER }
    const note = Array.from(new TextEncoder().encode(payoutNote(row)), b => b.toString(16).padStart(2, '0')).join('')
    expect(payoutNote(row)).toBe('Nimcade Daily Cup 2026-09-13 dodge #1')
    const tx = { hash: 'h', from: HOT, to: WINNER, value: 500_000, recipientData: note, executionResult: true }
    expect(isPayoutTransaction(tx, row, HOT)).toBe(true)
    expect(isPayoutTransaction({ ...tx, recipientData: note.toUpperCase() }, row, HOT.replace(/ /g, ''))).toBe(true)
    expect(isPayoutTransaction({ ...tx, value: 499_999 }, row, HOT)).toBe(false)
    expect(isPayoutTransaction({ ...tx, to: HOT }, row, HOT)).toBe(false)
    expect(isPayoutTransaction({ ...tx, recipientData: '' }, row, HOT)).toBe(false)
    expect(isPayoutTransaction({ ...tx, executionResult: false }, row, HOT)).toBe(false)
    expect(isPayoutTransaction(tx, { ...row, rank: 2 }, HOT)).toBe(false)
  })
})

describe('pay-cup trigger', () => {
  const NOW = new Date('2026-09-14T00:05:00Z')
  const setup = (overrides: Partial<Parameters<typeof createPayCupHandler>[0]> = {}, options: FakeOptions = {}) => {
    const f = fake({ dodge: { poolLuna: 1_000_000, seedLuna: 0, paidAt: null } }, { dodge: [winner(1)] }, options)
    const handler = createPayCupHandler({ adminKey: 'k3y-for-tests', deps: f.deps, hotWalletAddress: () => 'NQ00 HOT', now: () => NOW, ...overrides })
    const call = (request: { key?: string; query?: string; body?: unknown; method?: string } = {}) => handler(new Request(`https://project.supabase.co/functions/v1/pay-cup${request.query ?? ''}`, {
      method: request.method ?? 'POST',
      headers: request.key ? { 'X-Cup-Admin-Key': request.key } : {},
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    }))
    return { f, call }
  }

  it('needs the admin key', async () => {
    const { f, call } = setup()
    expect((await call()).status).toBe(401)
    expect((await call({ key: 'k3y-for-test' })).status).toBe(401)
    expect((await call({ key: 'k3y-for-tests', method: 'GET' })).status).toBe(405)
    expect(f.deps.loadCup).not.toHaveBeenCalled()
    expect((await setup({ adminKey: undefined }).call({ key: 'anything' })).status).toBe(500)
    expect([sameSecret('abc', 'abc'), sameSecret('abd', 'abc'), sameSecret('ab', 'abc'), sameSecret(null, 'abc'), sameSecret('', '')]).toEqual([true, false, false, false, false])
  })

  it('pays yesterday by default, or the day asked for, and reports the balance', async () => {
    const { f, call } = setup({}, { balance: 2_000_000 })
    const response = await call({ key: 'k3y-for-tests', body: {} })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, dryRun: false, retryDue: false, hotWallet: 'NQ00 HOT', balanceLuna: 2_000_000, day: '2026-09-13', games: [{ gameId: 'dodge', status: 'paid' }] })
    await call({ key: 'k3y-for-tests', query: '?day=2026-09-10&dryRun=1' })
    await call({ key: 'k3y-for-tests', body: { day: '2026-09-11', dryRun: true } })
    expect(f.deps.loadCup.mock.calls.map(([, day]) => day)).toEqual(['2026-09-13', '2026-09-10', '2026-09-11'])
    expect((await call({ key: 'k3y-for-tests', query: '?day=2026-09-14' })).status).toBe(400)
    expect((await call({ key: 'k3y-for-tests', query: '?day=13-09-2026' })).status).toBe(400)
  })

  it('retries due rows with ?retryDue=1', async () => {
    const { f, call } = setup({}, { due: { dodge: [dueRow('dodge', 1, 500_000)] } })
    const body = await (await call({ key: 'k3y-for-tests', query: '?retryDue=1&day=2026-09-12' })).json()
    expect(body).toMatchObject({ ok: true, retryDue: true, day: '2026-09-12', games: [{ gameId: 'dodge', status: 'paid' }] })
    expect(f.deps.loadDuePayouts).toHaveBeenCalledWith('dodge', '2026-09-12')
    expect(f.deps.claimCup).not.toHaveBeenCalled()
  })

  it("answers 502 without claiming when the balance can't be read", async () => {
    const { f, call } = setup({}, { balance: new Error('HTTP 502') })
    const response = await call({ key: 'k3y-for-tests' })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, hotWallet: 'NQ00 HOT', error: 'Could not read the hot wallet balance: HTTP 502' })
    expect(f.deps.claimCup).not.toHaveBeenCalled()
  })

  it('claims nothing when the hot wallet key is missing, but a dry run still plans', async () => {
    const { f, call } = setup({ hotWalletAddress: () => { throw new Error('CUP_HOT_WALLET_SEED must be 64 hex characters, optionally prefixed with "entropy:".') } })
    const response = await call({ key: 'k3y-for-tests' })
    expect(response.status).toBe(500)
    expect(f.deps.claimCup).not.toHaveBeenCalled()
    const dry = await call({ key: 'k3y-for-tests', query: '?dryRun=true' })
    expect(await dry.json()).toMatchObject({ ok: true, dryRun: true, hotWallet: null, games: [{ status: 'planned' }] })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { isFinishedDay, payCups, PAYOUT_SPLIT_PERCENT, previousUtcDay, sameSecret, splitPool } from '../../supabase/functions/_shared/cupPayout.ts'
import type { CupRow, PayCupDeps, PayoutRow, PayoutUpdate, Winner } from '../../supabase/functions/_shared/cupPayout.ts'
import { createPayCupHandler } from '../../supabase/functions/pay-cup/handler.ts'
import { prizeNim } from './cupApi'

const DAY = '2026-09-13'
const winner = (n: number): Winner => ({ wallet: `NQ0${n} WINNER`, name: `player${n}`, score: 1000 - n })

/** In-memory cups and scores; claimCup behaves like the SQL (once, only when non-empty). */
function fake(cups: Record<string, CupRow | null>, winners: Record<string, Winner[]>, send?: (row: PayoutRow) => Promise<string>) {
  const claimed = new Set<string>()
  const inserted: PayoutRow[] = []
  const marks: [number, PayoutUpdate][] = []
  const deps = {
    gameIds: Object.keys(cups),
    loadCup: vi.fn(async (gameId: string, _day: string) => cups[gameId] ?? null),
    loadWinners: vi.fn(async (gameId: string, _day: string, limit: number) => (winners[gameId] ?? []).slice(0, limit)),
    claimCup: vi.fn(async (gameId: string) => {
      const cup = cups[gameId]
      if (!cup || cup.paidAt || claimed.has(gameId) || cup.poolLuna + cup.seedLuna <= 0)
        return null
      claimed.add(gameId)
      return cup.poolLuna + cup.seedLuna
    }),
    insertPayouts: vi.fn(async (rows: PayoutRow[]) => { inserted.push(...rows) }),
    markPayout: vi.fn(async (row: PayoutRow, update: PayoutUpdate) => { marks.push([row.rank, update]) }),
    send: vi.fn(send ?? (async (row: PayoutRow) => `hash-${row.gameId}-${row.rank}`)),
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
    const f = fake({ dodge: { poolLuna: 700_000, seedLuna: 300_000, paidAt: null } }, { dodge: [1, 2, 3, 4].map(winner) })
    const result = await payCups(DAY, f.deps)
    expect(result.games[0]).toMatchObject({ gameId: 'dodge', status: 'paid', totalLuna: 1_000_000 })
    expect(result.games[0].payouts).toEqual([
      { rank: 1, wallet: 'NQ01 WINNER', amountLuna: 500_000, status: 'sent', txHash: 'hash-dodge-1' },
      { rank: 2, wallet: 'NQ02 WINNER', amountLuna: 300_000, status: 'sent', txHash: 'hash-dodge-2' },
      { rank: 3, wallet: 'NQ03 WINNER', amountLuna: 200_000, status: 'sent', txHash: 'hash-dodge-3' },
    ])
    expect(f.inserted.map(row => [row.rank, row.name, row.score, row.day])).toEqual([[1, 'player1', 999, DAY], [2, 'player2', 998, DAY], [3, 'player3', 997, DAY]])
    expect(f.marks).toEqual([[1, { status: 'sent', txHash: 'hash-dodge-1' }], [2, { status: 'sent', txHash: 'hash-dodge-2' }], [3, { status: 'sent', txHash: 'hash-dodge-3' }]])
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

  it("writes 'due' rows when sending fails, and still pays the rest", async () => {
    const f = fake({ dodge: { poolLuna: 1_000_000, seedLuna: 0, paidAt: null } }, { dodge: [1, 2, 3].map(winner) }, async (row) => {
      if (row.rank === 2)
        throw new Error('sendRawTransaction: insufficient funds')
      return `hash-${row.rank}`
    })
    const game = (await payCups(DAY, f.deps)).games[0]
    expect(game.status).toBe('partly-due')
    expect(game.payouts?.[1]).toEqual({ rank: 2, wallet: 'NQ02 WINNER', amountLuna: 300_000, status: 'due', txHash: null, error: 'sendRawTransaction: insufficient funds' })
    expect(f.marks).toEqual([[1, { status: 'sent', txHash: 'hash-1' }], [2, { status: 'due' }], [3, { status: 'sent', txHash: 'hash-3' }]])

    const broken = fake({ dodge: { poolLuna: 1_000_000, seedLuna: 0, paidAt: null } }, { dodge: [winner(1)] }, async () => { throw new Error('RPC down') })
    expect((await payCups(DAY, broken.deps)).games[0].status).toBe('due')
    expect(broken.marks).toEqual([[1, { status: 'due' }]])
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

describe('pay-cup trigger', () => {
  const NOW = new Date('2026-09-14T00:05:00Z')
  const setup = (overrides: Partial<Parameters<typeof createPayCupHandler>[0]> = {}) => {
    const f = fake({ dodge: { poolLuna: 1_000_000, seedLuna: 0, paidAt: null } }, { dodge: [winner(1)] })
    const handler = createPayCupHandler({ adminKey: 'k3y-for-tests', deps: f.deps, hotWalletAddress: () => 'NQ00 HOT', now: () => NOW, ...overrides })
    const call = (options: { key?: string; query?: string; body?: unknown; method?: string } = {}) => handler(new Request(`https://project.supabase.co/functions/v1/pay-cup${options.query ?? ''}`, {
      method: options.method ?? 'POST',
      headers: options.key ? { 'X-Cup-Admin-Key': options.key } : {},
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
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

  it('pays yesterday by default, or the day asked for', async () => {
    const { f, call } = setup()
    const response = await call({ key: 'k3y-for-tests', body: {} })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, dryRun: false, hotWallet: 'NQ00 HOT', day: '2026-09-13', games: [{ gameId: 'dodge', status: 'paid' }] })
    await call({ key: 'k3y-for-tests', query: '?day=2026-09-10&dryRun=1' })
    await call({ key: 'k3y-for-tests', body: { day: '2026-09-11', dryRun: true } })
    expect(f.deps.loadCup.mock.calls.map(([, day]) => day)).toEqual(['2026-09-13', '2026-09-10', '2026-09-11'])
    expect((await call({ key: 'k3y-for-tests', query: '?day=2026-09-14' })).status).toBe(400)
    expect((await call({ key: 'k3y-for-tests', query: '?day=13-09-2026' })).status).toBe(400)
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

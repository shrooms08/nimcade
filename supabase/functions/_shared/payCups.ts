import { PAYOUT_SPLIT_PERCENT, payoutNote, splitPool } from './cupPayout.ts'
import { formatAddress, isNimiqAddress } from './nimiqRpc.ts'
import type { RpcTransaction } from './nimiqRpc.ts'

/** The reason on rows held back because the hot wallet can't cover a game's prizes. */
export const INSUFFICIENT_BALANCE = 'insufficient hot wallet balance'

export interface CupRow { poolLuna: number; seedLuna: number; paidAt: string | null }
export interface Winner { wallet: string; name: string | null; score: number }
export interface PayoutRow { gameId: string; day: string; rank: number; wallet: string; name: string | null; score: number; amountLuna: number }
export type PayoutUpdate = { status: 'sent'; txHash: string } | { status: 'due'; reason: string }

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
  /** The hot wallet's balance in Luna. */
  getBalance: () => Promise<number>
  /** retryDue: the day's 'due' payouts for a game, by rank. */
  loadDuePayouts: (gameId: string, day: string) => Promise<PayoutRow[]>
  /** retryDue: moves a row from 'due' to 'sending'; false when it is no longer due. */
  claimDuePayout: (row: PayoutRow) => Promise<boolean>
  /** retryDue: this prize's transaction hash if an earlier attempt did reach the chain, else null. */
  findPaid: (row: PayoutRow) => Promise<string | null>
}

export interface PayoutSummary { rank: number; wallet: string; amountLuna: number; status: 'planned' | 'sent' | 'due'; txHash: string | null; error?: string }
export interface GameSummary {
  gameId: string
  status: 'planned' | 'paid' | 'partly-due' | 'due' | 'skipped' | 'error'
  reason?: string
  totalLuna?: number
  /** What the hot wallet had left for this game when it was checked. */
  balanceLuna?: number | null
  payouts?: PayoutSummary[]
}
export interface PayRunOptions { dryRun?: boolean; retryDue?: boolean }
export interface PayRunResult { day: string; balanceLuna: number | null; games: GameSummary[] }

/** The balance couldn't be read, so nothing was claimed or sent. */
export class BalanceUnavailableError extends Error {}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200)
const sum = (rows: PayoutRow[]) => rows.reduce((total, row) => total + row.amountLuna, 0)
const base = (row: PayoutRow) => ({ rank: row.rank, wallet: row.wallet, amountLuna: row.amountLuna })
const toHex = (text: string) => Array.from(new TextEncoder().encode(text), byte => byte.toString(16).padStart(2, '0')).join('')

/** Whether a hot wallet transaction is this prize: same recipient, value and note. */
export function isPayoutTransaction(tx: RpcTransaction, row: PayoutRow, hotWallet: string): boolean {
  if (![tx.from, tx.to, row.wallet, hotWallet].every(isNimiqAddress))
    return false
  return formatAddress(tx.from) === formatAddress(hotWallet) && formatAddress(tx.to) === formatAddress(row.wallet)
    && Number(tx.value) === row.amountLuna && tx.executionResult !== false
    && (tx.recipientData ?? '').toLowerCase() === toHex(payoutNote(row))
}

/** The balance read at the start of the run, less what this run has sent (null when unknown). */
interface Budget { luna: number | null }
const covers = (budget: Budget, total: number) => budget.luna === null || total <= budget.luna
const spend = (budget: Budget, amount: number) => {
  if (budget.luna !== null)
    budget.luna -= amount
}

function outcome(payouts: PayoutSummary[]): GameSummary['status'] {
  const due = payouts.filter(p => p.status === 'due').length
  return due === 0 ? 'paid' : due === payouts.length ? 'due' : 'partly-due'
}

function plan(gameId: string, day: string, totalLuna: number, winners: Winner[]): PayoutRow[] {
  const amounts = splitPool(totalLuna, winners.length)
  return winners
    .map((winner, i) => ({ gameId, day, rank: i + 1, wallet: winner.wallet, name: winner.name, score: winner.score, amountLuna: amounts[i] }))
    .filter(row => row.amountLuna > 0)
}

/** A dry run's plan; it draws on the budget only when the budget covers it. */
function planned(gameId: string, rows: PayoutRow[], budget: Budget, totalLuna: number): GameSummary {
  const enough = covers(budget, sum(rows))
  const summary: GameSummary = { gameId, status: 'planned', totalLuna, balanceLuna: budget.luna, payouts: rows.map(row => ({ ...base(row), status: 'planned', txHash: null })) }
  if (!enough)
    return { ...summary, reason: INSUFFICIENT_BALANCE }
  spend(budget, sum(rows))
  return summary
}

/** No partial payouts: every row waits until the hot wallet can pay them all. */
async function holdForBalance(rows: PayoutRow[], deps: PayCupDeps): Promise<PayoutSummary[]> {
  for (const row of rows)
    await deps.markPayout(row, { status: 'due', reason: INSUFFICIENT_BALANCE }).catch(() => {})
  return rows.map(row => ({ ...base(row), status: 'due', txHash: null, error: INSUFFICIENT_BALANCE }))
}

async function sendRows(rows: PayoutRow[], deps: PayCupDeps, budget: Budget): Promise<PayoutSummary[]> {
  const payouts: PayoutSummary[] = []
  for (const row of rows) {
    try {
      const txHash = await deps.send(row)
      spend(budget, row.amountLuna)
      await deps.markPayout(row, { status: 'sent', txHash })
      payouts.push({ ...base(row), status: 'sent', txHash })
    }
    catch (error) {
      // A row whose send did reach the chain is found again by retryDue before it resends.
      const reason = message(error)
      await deps.markPayout(row, { status: 'due', reason }).catch(() => {})
      payouts.push({ ...base(row), status: 'due', txHash: null, error: reason })
    }
  }
  return payouts
}

async function payGame(gameId: string, day: string, deps: PayCupDeps, budget: Budget, dryRun: boolean): Promise<GameSummary> {
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
  if (dryRun)
    return planned(gameId, plan(gameId, day, available, winners), budget, available)

  // Claiming first (paid_at) means a second run, or a retry after a crash, never pays twice.
  const totalLuna = await deps.claimCup(gameId, day)
  if (totalLuna === null)
    return { gameId, status: 'skipped', reason: 'already paid' }
  const rows = plan(gameId, day, totalLuna, winners)
  await deps.insertPayouts(rows)
  const balanceLuna = budget.luna
  if (!covers(budget, sum(rows)))
    return { gameId, status: 'due', reason: INSUFFICIENT_BALANCE, totalLuna, balanceLuna, payouts: await holdForBalance(rows, deps) }
  const payouts = await sendRows(rows, deps, budget)
  return { gameId, status: outcome(payouts), totalLuna, balanceLuna, payouts }
}

/** Re-attempts a day's 'due' rows for a game, all or none, never resending a prize already on chain. */
async function retryGame(gameId: string, day: string, deps: PayCupDeps, budget: Budget, dryRun: boolean): Promise<GameSummary> {
  const due = await deps.loadDuePayouts(gameId, day)
  if (due.length === 0)
    return { gameId, status: 'skipped', reason: 'nothing due' }
  const totalLuna = sum(due)
  const settled: PayoutSummary[] = []
  const unpaid: PayoutRow[] = []
  for (const row of due) {
    let txHash: string | null
    try {
      txHash = await deps.findPaid(row)
    }
    catch (error) {
      settled.push({ ...base(row), status: 'due', txHash: null, error: `could not check earlier attempts: ${message(error)}` })
      continue
    }
    if (!txHash)
      unpaid.push(row)
    else if (dryRun || await deps.claimDuePayout(row)) {
      if (!dryRun)
        await deps.markPayout(row, { status: 'sent', txHash })
      settled.push({ ...base(row), status: 'sent', txHash })
    }
  }

  if (dryRun) {
    const next = planned(gameId, unpaid, budget, totalLuna)
    return { ...next, payouts: [...settled, ...(next.payouts ?? [])] }
  }
  const balanceLuna = budget.luna
  if (!covers(budget, sum(unpaid))) {
    const payouts = [...settled, ...await holdForBalance(unpaid, deps)]
    return { gameId, status: outcome(payouts), reason: INSUFFICIENT_BALANCE, totalLuna, balanceLuna, payouts }
  }
  const claimed: PayoutRow[] = []
  for (const row of unpaid) {
    if (await deps.claimDuePayout(row))
      claimed.push(row)
  }
  const payouts = [...settled, ...await sendRows(claimed, deps, budget)]
  if (payouts.length === 0)
    return { gameId, status: 'skipped', reason: 'already being retried' }
  return { gameId, status: outcome(payouts), totalLuna, balanceLuna, payouts }
}

/**
 * Pays every game's Cup for `day`, or with retryDue re-attempts its 'due' rows. The hot wallet
 * balance is read once up front; a game whose prizes it can't cover is held back whole. One
 * game failing doesn't stop the others.
 */
export async function payCups(day: string, deps: PayCupDeps, options: PayRunOptions = {}): Promise<PayRunResult> {
  const dryRun = options.dryRun === true
  let balanceLuna: number | null = null
  try {
    balanceLuna = await deps.getBalance()
  }
  catch (error) {
    if (!dryRun)
      throw new BalanceUnavailableError(`Could not read the hot wallet balance: ${message(error)}`)
  }
  const budget: Budget = { luna: balanceLuna }
  const games: GameSummary[] = []
  for (const gameId of deps.gameIds) {
    try {
      games.push(await (options.retryDue ? retryGame : payGame)(gameId, day, deps, budget, dryRun))
    }
    catch (error) {
      games.push({ gameId, status: 'error', reason: message(error) })
    }
  }
  return { day, balanceLuna, games }
}

// pay-cup: pays each game's finished Daily Cup (50/30/20 of pool plus seed) from the hot wallet.
// Runs at 00:05 UTC through pg_cron (supabase/migrations/0003_schedule_pay_cup.sql) and can be
// triggered by hand with the same X-Cup-Admin-Key header (?day=, ?dryRun=1, ?retryDue=1).
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Set with
// `supabase secrets set`: NIMIQ_NETWORK ("mainnet" or "testnet"), CUP_HOT_WALLET_SEED (never
// logged or returned), CUP_ADMIN_KEY, and optionally NIMIQ_RPC_URL.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { KeyPair } from 'npm:@nimiq/core@2.21.0'
import { createNimiqRpc, NIMIQ_NETWORK_IDS, NIMIQ_RPC_URLS, parseNetwork } from '../_shared/nimiqRpc.ts'
import { isPayoutTransaction } from '../_shared/payCups.ts'
import type { PayoutRow } from '../_shared/payCups.ts'
import { CUP_GAME_IDS } from '../_shared/scoreMessage.ts'
import { createPayCupHandler } from './handler.ts'
import { createCupSender, loadHotWallet } from './hotWallet.ts'

const url = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !serviceRoleKey)
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
const network = parseNetwork(Deno.env.get('NIMIQ_NETWORK'))

const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const rpc = createNimiqRpc(Deno.env.get('NIMIQ_RPC_URL') || NIMIQ_RPC_URLS[network])

let keyPair: KeyPair | null = null
const hotWallet = () => (keyPair ??= loadHotWallet(Deno.env.get('CUP_HOT_WALLET_SEED')))
const hotWalletAddress = () => hotWallet().toAddress().toUserFriendlyAddress()

/** How much of the hot wallet's history retryDue searches for a prize that already went out. */
const PAID_LOOKBACK = 100

const byPayout = (row: PayoutRow) => ({ game_id: row.gameId, day: row.day, rank: row.rank })

Deno.serve(createPayCupHandler({
  adminKey: Deno.env.get('CUP_ADMIN_KEY'),
  hotWalletAddress,
  deps: {
    gameIds: CUP_GAME_IDS,
    async loadCup(gameId, day) {
      const { data, error } = await db.from('cups').select('pool_luna, seed_luna, paid_at').eq('game_id', gameId).eq('day', day).maybeSingle()
      if (error)
        throw error
      return data ? { poolLuna: Number(data.pool_luna), seedLuna: Number(data.seed_luna), paidAt: data.paid_at } : null
    },
    async loadWinners(gameId, day, limit) {
      const { data, error } = await db.from('scores').select('wallet, name, score').eq('game_id', gameId).eq('day', day)
        .order('score', { ascending: false }).order('created_at', { ascending: true }).limit(limit)
      if (error)
        throw error
      return (data ?? []).map(row => ({ wallet: row.wallet, name: row.name, score: row.score }))
    },
    async claimCup(gameId, day) {
      const { data, error } = await db.rpc('claim_cup', { p_game_id: gameId, p_day: day })
      if (error)
        throw error
      return data === null ? null : Number(data)
    },
    async insertPayouts(rows) {
      const { error } = await db.from('payouts').insert(rows.map(row => ({
        ...byPayout(row),
        wallet: row.wallet,
        name: row.name,
        score: row.score,
        amount_luna: row.amountLuna,
        status: 'sending',
      })))
      if (error)
        throw error
    },
    async markPayout(row, update) {
      const { error } = await db.from('payouts')
        .update(update.status === 'sent' ? { status: 'sent', tx_hash: update.txHash, reason: null } : { status: 'due', tx_hash: null, reason: update.reason })
        .match(byPayout(row))
      if (error)
        throw error
    },
    send: row => createCupSender(hotWallet(), rpc, NIMIQ_NETWORK_IDS[network])(row),
    getBalance: () => rpc.getBalance(hotWalletAddress()),
    async loadDuePayouts(gameId, day) {
      const { data, error } = await db.from('payouts').select('rank, wallet, name, score, amount_luna')
        .eq('game_id', gameId).eq('day', day).eq('status', 'due').order('rank')
      if (error)
        throw error
      return (data ?? []).map(row => ({ gameId, day, rank: row.rank, wallet: row.wallet, name: row.name, score: row.score ?? 0, amountLuna: Number(row.amount_luna) }))
    },
    async claimDuePayout(row) {
      const { data, error } = await db.from('payouts').update({ status: 'sending', reason: null })
        .match({ ...byPayout(row), status: 'due' }).select('rank')
      if (error)
        throw error
      return (data ?? []).length > 0
    },
    async findPaid(row) {
      const history = await rpc.getTransactionsByAddress(hotWalletAddress(), PAID_LOOKBACK)
      return history.find(tx => isPayoutTransaction(tx, row, hotWalletAddress()))?.hash ?? null
    },
  },
}))

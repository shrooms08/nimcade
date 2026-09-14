// pay-cup: pays each game's finished Daily Cup (50/30/20 of pool plus seed) from the hot wallet.
// Runs at 00:05 UTC through pg_cron (supabase/migrations/0003_schedule_pay_cup.sql) and can be
// triggered by hand with the same X-Cup-Admin-Key header.
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Set with
// `supabase secrets set`: NIMIQ_NETWORK ("mainnet" or "testnet"), CUP_HOT_WALLET_SEED (never
// logged or returned), CUP_ADMIN_KEY, and optionally NIMIQ_RPC_URL.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { KeyPair } from 'npm:@nimiq/core@2.21.0'
import { createNimiqRpc, NIMIQ_NETWORK_IDS, NIMIQ_RPC_URLS, parseNetwork } from '../_shared/nimiqRpc.ts'
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

Deno.serve(createPayCupHandler({
  adminKey: Deno.env.get('CUP_ADMIN_KEY'),
  hotWalletAddress: () => hotWallet().toAddress().toUserFriendlyAddress(),
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
        game_id: row.gameId,
        day: row.day,
        rank: row.rank,
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
        .update(update.status === 'sent' ? { status: 'sent', tx_hash: update.txHash } : { status: 'due', tx_hash: null })
        .eq('game_id', row.gameId).eq('day', row.day).eq('rank', row.rank)
      if (error)
        throw error
    },
    send: row => createCupSender(hotWallet(), rpc, NIMIQ_NETWORK_IDS[network])(row),
  },
}))

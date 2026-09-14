// record-tip: checks a tip against the Nimiq chain, records it once and adds 30% to the Cup pool.
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Set with
// `supabase secrets set`: NIMIQ_NETWORK ("mainnet" or "testnet"), MAKER_ADDRESS (the address
// tips go to, VITE_MAKER_ADDRESS; comma-separate several), ALLOWED_ORIGINS, and optionally
// NIMIQ_RPC_URL to use another RPC server than the public one for the network.
//
// Logs are one JSON object per line ({"fn":"record-tip","event":"tip"|"lookup"|"decision",...}).
// They never include secrets; the RPC URL is logged as its origin only.
import { Transaction } from 'npm:@nimiq/core@2.21.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createNimiqRpc, NIMIQ_RPC_URLS, parseNetwork } from '../_shared/nimiqRpc.ts'
import { hexToBytes } from '../_shared/nimiqSignature.ts'
import type { TipLog } from '../_shared/recordTip.ts'
import { createRecordTipHandler } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !serviceRoleKey)
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
const network = parseNetwork(Deno.env.get('NIMIQ_NETWORK'))
const makerAddresses = (Deno.env.get('MAKER_ADDRESS') ?? '').split(',').map(address => address.trim()).filter(Boolean)
if (makerAddresses.length === 0)
  throw new Error('MAKER_ADDRESS must be set.')

const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const rpcUrl = Deno.env.get('NIMIQ_RPC_URL') || NIMIQ_RPC_URLS[network]
const rpc = createNimiqRpc(rpcUrl)

const log: TipLog = (event, fields) => console.log(JSON.stringify({ fn: 'record-tip', event, network, ...fields }))

Deno.serve(createRecordTipHandler({
  corsHeaders,
  allowedOrigins: Deno.env.get('ALLOWED_ORIGINS'),
  deps: {
    makerAddresses,
    rpcUrl: new URL(rpcUrl).origin,
    log,
    getTransaction: hash => rpc.getTransaction(hash),
    getTransactionsByAddress: (address, max) => rpc.getTransactionsByAddress(address, max),
    hashOfSerialized(hex) {
      const bytes = hexToBytes(hex)
      if (!bytes)
        throw new Error('invalid hex')
      return Transaction.deserialize(bytes).hash()
    },
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    now: () => new Date(),
    async recordTip(row) {
      const { data, error } = await db.rpc('record_tip', {
        p_game_id: row.gameId,
        p_day: row.day,
        p_tx_hash: row.txHash,
        p_from_wallet: row.fromWallet,
        p_to_wallet: row.toWallet,
        p_amount_luna: row.amountLuna,
        p_pool_share_luna: row.poolShareLuna,
      })
      if (error)
        throw error
      return data === null ? { recorded: false, poolLuna: null } : { recorded: true, poolLuna: Number(data) }
    },
  },
}))

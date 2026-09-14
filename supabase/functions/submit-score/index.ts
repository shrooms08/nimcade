// submit-score: verifies a Nimiq-signed Daily Cup entry and records it with the service role.
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase; ALLOWED_ORIGINS
// (comma-separated, e.g. the Vercel URL) is set with `supabase secrets set`.
import { blake2b } from 'npm:@noble/hashes@2.4.0/blake2.js'
import { sha256 } from 'npm:@noble/hashes@2.4.0/sha2.js'
import { ed25519 } from 'npm:@noble/curves@2.4.0/ed25519.js'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createNimiqVerifier } from '../_shared/nimiqSignature.ts'
import { createSubmitScoreHandler } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !serviceRoleKey)
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')

const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

const verifier = createNimiqVerifier({
  sha256: data => sha256(data),
  blake2b256: data => blake2b(data, { dkLen: 32 }),
  ed25519Verify: (signature, message, publicKey) => ed25519.verify(signature, message, publicKey),
})

Deno.serve(createSubmitScoreHandler({
  verifier,
  corsHeaders,
  allowedOrigins: Deno.env.get('ALLOWED_ORIGINS'),
  store: {
    async recordScore(row) {
      const { data, error } = await db.rpc('record_score', {
        p_game_id: row.gameId,
        p_day: row.day,
        p_score: row.score,
        p_wallet: row.wallet,
        p_device_id: row.deviceId,
        p_name: row.name,
        p_signature: row.signature,
        p_public_key: row.publicKey,
      })
      if (error)
        throw error
      return Number(data)
    },
    async rankOf(gameId, day, deviceId) {
      const { data, error } = await db.from('cup_board').select('rank').eq('game_id', gameId).eq('day', day).eq('device_id', deviceId).maybeSingle()
      if (error)
        throw error
      return data ? Number(data.rank) : null
    },
  },
}))

// Looks a Nimiq transaction up the way record-tip does and prints the raw JSON-RPC response.
//
//   node scripts/check-tx.mjs <tx-hash | serialized-tx-hex> [testnet|mainnet]
//
// Uses the same RPC endpoint (NIMIQ_RPC_URLS, or NIMIQ_RPC_URL if set), method
// (getTransactionByHash) and hash normalization as the function; a serialized transaction is
// hashed with @nimiq/core first. If that lookup returns an error or "not found", it also tries the
// other public endpoints and hash encodings and reports which combinations find it.
import * as core from '@nimiq/core'
import { NIMIQ_RPC_URLS, parseNetwork } from '../supabase/functions/_shared/nimiqRpc.ts'
import { normalizeTxHash } from '../supabase/functions/_shared/recordTip.ts'

const [input, networkArg = 'testnet'] = process.argv.slice(2)
if (!input) {
  console.error('Usage: node scripts/check-tx.mjs <tx-hash | serialized-tx-hex> [testnet|mainnet]')
  process.exit(1)
}
const network = parseNetwork(networkArg)
const url = process.env.NIMIQ_RPC_URL || NIMIQ_RPC_URLS[network]
const METHOD = 'getTransactionByHash'

const ref = normalizeTxHash(input)
if (!ref) {
  console.error('Not a transaction hash or serialized transaction (hex).')
  process.exit(1)
}
let hash = ref.kind === 'hash' ? ref.hash : null
if (ref.kind === 'serialized') {
  const Nimiq = core.default ?? core
  const tx = Nimiq.Transaction.deserialize(Uint8Array.from(ref.hex.match(/../g), byte => parseInt(byte, 16)))
  hash = tx.hash()
  console.log(`serialized transaction (${ref.hex.length / 2} bytes) -> hash ${hash}`)
}

async function lookup(endpoint, candidate) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: METHOD, params: [candidate] }),
    })
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    }
    catch {}
    return { status: response.status, text, json }
  }
  catch (error) {
    return { status: 0, text: String(error?.cause?.message ?? error?.message ?? error), json: null }
  }
}

const found = result => Boolean(result.json?.result?.data?.hash)
const summary = (result) => {
  if (found(result))
    return `found in block ${result.json.result.data.blockNumber}`
  const error = result.json?.error
  return error ? `error: ${typeof error === 'string' ? error : (error.data ?? error.message)}` : `HTTP ${result.status}: ${result.text.slice(0, 120)}`
}

console.log(`${METHOD} on ${url} (${network}) for ${hash}`)
const first = await lookup(url, hash)
console.log(`HTTP ${first.status}`)
console.log(first.json ? JSON.stringify(first.json, null, 2) : first.text)
if (found(first))
  process.exit(0)

console.log('\nNot found there; trying other endpoints and encodings:')
const encodings = [...new Set([input.trim(), hash, hash.toUpperCase(), `0x${hash}`, `0x${hash.toUpperCase()}`])]
const endpoints = [...new Set([url, ...Object.values(NIMIQ_RPC_URLS), ...Object.values(NIMIQ_RPC_URLS).map(u => u.endsWith('/') ? u.slice(0, -1) : `${u}/`)])]
const hits = []
for (const endpoint of endpoints) {
  for (const candidate of encodings) {
    const result = await lookup(endpoint, candidate)
    console.log(`  ${endpoint} | ${candidate.slice(0, 12)}… | ${summary(result)}`)
    if (found(result))
      hits.push(`${endpoint} with ${candidate.slice(0, 12)}…`)
  }
}
console.log(hits.length ? `\nFound with:\n  ${hits.join('\n  ')}` : '\nNo combination found the transaction.')
process.exit(hits.length ? 0 : 2)

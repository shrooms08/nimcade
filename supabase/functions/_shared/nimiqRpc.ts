import { normalizeAddress } from './nimiqSignature.ts'

/**
 * A small client for the public Nimiq Albatross JSON-RPC servers (listed in nimiq/awesome).
 * Results arrive wrapped as { data, metadata }; an unknown or not yet mined hash is an error
 * whose data reads "Transaction not found: <hash>".
 */

export type NimiqNetwork = 'mainnet' | 'testnet'

export const NIMIQ_RPC_URLS: Record<NimiqNetwork, string> = {
  mainnet: 'https://rpc.nimiqwatch.com',
  testnet: 'https://rpc.testnet.nimiqwatch.com',
}

/** Albatross network ids, as reported in each transaction's networkId. */
export const NIMIQ_NETWORK_IDS: Record<NimiqNetwork, number> = { mainnet: 24, testnet: 5 }

export function parseNetwork(value: string | undefined): NimiqNetwork {
  if (value === 'mainnet' || value === 'testnet')
    return value
  throw new Error('NIMIQ_NETWORK must be "mainnet" or "testnet".')
}

/** "nq41sngm…" or "NQ41 SNGM …" -> "NQ41 SNGM 484K …", the form the app stores. */
export function formatAddress(value: string): string {
  return normalizeAddress(value).replace(/(.{4})(?=.)/g, '$1 ')
}

export const isNimiqAddress = (value: unknown): value is string =>
  typeof value === 'string' && /^NQ\d{2}[0-9A-Z]{32}$/.test(normalizeAddress(value))

/** The fields of an executed transaction this app reads. */
export interface RpcTransaction {
  hash: string
  blockNumber?: number
  timestamp?: number
  from: string
  /** 0 basic, 1 vesting, 2 HTLC, 3 staking. */
  fromType?: number
  to: string
  value: number
  /** Hex; "" when the transaction carries no data. */
  recipientData?: string
  executionResult?: boolean
}

export class RpcError extends Error {}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export function createNimiqRpc(url: string, fetchFn: FetchLike = fetch) {
  async function call<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    if (!response.ok)
      throw new RpcError(`${method}: HTTP ${response.status}`)
    const json = await response.json() as { result?: unknown; error?: string | { message?: string; data?: unknown } }
    if (json.error) {
      const detail = typeof json.error === 'string' ? json.error : String(json.error.data ?? json.error.message)
      throw new RpcError(`${method}: ${detail}`)
    }
    const result = json.result
    return (result !== null && typeof result === 'object' && 'data' in result ? result.data : result) as T
  }

  return {
    getBlockNumber: () => call<number>('getBlockNumber', []),
    /** The transaction once it is in a block, or null while the network doesn't know it yet. */
    async getTransaction(hash: string): Promise<RpcTransaction | null> {
      try {
        const tx = await call<RpcTransaction | null>('getTransactionByHash', [hash])
        return tx && typeof tx.blockNumber === 'number' ? tx : null
      }
      catch (error) {
        if (error instanceof RpcError && /not found/i.test(error.message))
          return null
        throw error
      }
    },
    /** An account's balance in Luna (0 for an address the chain hasn't seen). */
    async getBalance(address: string): Promise<number> {
      const account = await call<{ balance?: number } | null>('getAccountByAddress', [address])
      return Number(account?.balance ?? 0)
    },
    /** Up to `max` of an address's most recent transactions, newest first. */
    getTransactionsByAddress: (address: string, max: number) => call<RpcTransaction[]>('getTransactionsByAddress', [address, max, null]),
    /** Broadcasts a signed transaction (hex); resolves with its hash. */
    sendRawTransaction: (rawTx: string) => call<string>('sendRawTransaction', [rawTx]),
  }
}

export type NimiqRpc = ReturnType<typeof createNimiqRpc>

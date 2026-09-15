import { Address, Entropy, KeyPair, PrivateKey, TransactionBuilder } from 'npm:@nimiq/core@2.21.0'
import { payoutNote } from '../_shared/cupPayout.ts'
import type { NimiqRpc } from '../_shared/nimiqRpc.ts'
import type { PayoutRow } from '../_shared/payCups.ts'

/** The first account of a Nimiq wallet created from entropy (BIP39 accounts). */
const ENTROPY_ACCOUNT_PATH = "m/44'/242'/0'/0'"

/**
 * The hot wallet key from CUP_HOT_WALLET_SEED: 64 hex characters, read as a private key, or
 * "entropy:<64 hex>" for a wallet's entropy (first account). Errors never include the value.
 */
export function loadHotWallet(seed: string | undefined): KeyPair {
  const value = (seed ?? '').trim()
  const fromEntropy = value.startsWith('entropy:')
  const hex = fromEntropy ? value.slice('entropy:'.length) : value
  if (!/^[0-9a-f]{64}$/i.test(hex))
    throw new Error('CUP_HOT_WALLET_SEED must be 64 hex characters, optionally prefixed with "entropy:".')
  try {
    const privateKey = fromEntropy
      ? Entropy.fromHex(hex).toExtendedPrivateKey().derivePath(ENTROPY_ACCOUNT_PATH).privateKey
      : PrivateKey.fromHex(hex)
    return KeyPair.derive(privateKey)
  }
  catch {
    throw new Error('CUP_HOT_WALLET_SEED could not be read as a key.')
  }
}

/** Signs a prize locally and broadcasts it through the RPC server. Resolves with the hash. */
export function createCupSender(keyPair: KeyPair, rpc: NimiqRpc, networkId: number) {
  return async (row: PayoutRow): Promise<string> => {
    const recipient = Address.fromUserFriendlyAddress(row.wallet)
    const validityStartHeight = await rpc.getBlockNumber()
    // The note makes each prize's transaction unique, tells the winner what it is, and lets
    // retryDue recognise a prize that already went out.
    const note = new TextEncoder().encode(payoutNote(row))
    const tx = TransactionBuilder.newBasicWithData(keyPair.toAddress(), recipient, note, BigInt(row.amountLuna), 0n, validityStartHeight, networkId)
    // The second key pair is only for staking transactions.
    tx.sign(keyPair, undefined)
    const hash = await rpc.sendRawTransaction(tx.toHex())
    return typeof hash === 'string' && hash ? hash : tx.hash()
  }
}

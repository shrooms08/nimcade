import { useCallback, useEffect, useRef, useState } from 'react'
import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import { connect, listAccounts, toMessage } from './nimiq'

export type WalletStatus =
  /** Waiting for Nimiq Pay to inject the provider. */
  | 'connecting'
  /** Provider is there, waiting for the user to approve account access. */
  | 'authorizing'
  /** Connected, `address` is set. */
  | 'ready'
  /** Provider present but account access was declined. */
  | 'denied'
  /** No provider after the timeout — a normal browser, most likely. */
  | 'unavailable'

/** How long to wait for the provider before falling back to browser mode. */
const PROVIDER_TIMEOUT_MS = 3000

/**
 * Ask for the account as soon as the provider is ready, so the status pill can
 * show the address without a tap. This opens Nimiq Pay's approval dialog on
 * load; set it to false to make the pill a "Connect wallet" button instead and
 * keep every approval dialog behind an explicit tap.
 */
const REQUEST_ACCOUNT_ON_LOAD = true

export interface Wallet {
  status: WalletStatus
  address: string | null
  error: string | null
  /** Resolves with the provider, or null when not running inside Nimiq Pay. */
  getProvider: () => Promise<NimiqProvider | null>
  /** Retry the connection after a denial or a failed connect. */
  retry: () => void
}

export function useWallet(): Wallet {
  const providerRef = useRef<Promise<NimiqProvider> | null>(null)
  // Held so React's double-invoked effects in StrictMode reuse the in-flight
  // request instead of opening a second approval dialog.
  const accountsRef = useRef<Promise<string[]> | null>(null)
  const [status, setStatus] = useState<WalletStatus>('connecting')
  const [address, setAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setError(null)

      let nimiq: NimiqProvider
      try {
        providerRef.current ??= connect(PROVIDER_TIMEOUT_MS)
        nimiq = await providerRef.current
      }
      catch {
        // Not inside Nimiq Pay (or it never answered). Drop the rejected
        // promise so a later retry starts a fresh connection.
        providerRef.current = null
        if (!cancelled)
          setStatus('unavailable')
        return
      }

      if (cancelled)
        return

      if (!REQUEST_ACCOUNT_ON_LOAD && attempt === 0) {
        setStatus('denied')
        return
      }
      setStatus('authorizing')

      try {
        accountsRef.current ??= listAccounts(nimiq)
        const accounts = await accountsRef.current
        if (cancelled)
          return

        if (accounts.length === 0) {
          setStatus('denied')
          setError('No Nimiq account available.')
          return
        }
        setAddress(accounts[0])
        setStatus('ready')
      }
      catch (cause) {
        accountsRef.current = null
        if (cancelled)
          return
        setStatus('denied')
        setError(toMessage(cause))
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [attempt])

  const getProvider = useCallback(async () => {
    if (!providerRef.current)
      return null
    try {
      return await providerRef.current
    }
    catch {
      return null
    }
  }, [])

  const retry = useCallback(() => {
    setStatus('connecting')
    setAttempt(value => value + 1)
  }, [])

  return { status, address, error, getProvider, retry }
}

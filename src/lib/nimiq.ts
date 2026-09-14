import { init } from '@nimiq/mini-app-sdk'
import type { NimiqProvider } from '@nimiq/mini-app-sdk'

/** 1 NIM = 100,000 Luna. */
export const LUNA_PER_NIM = 100_000

export function nimToLuna(nim: number): number {
  return Math.round(nim * LUNA_PER_NIM)
}

/**
 * Provider calls resolve with an `{ error }` object instead of rejecting for
 * some failures, so every result goes through this before it is trusted.
 */
export function getProviderErrorMessage(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('error' in value))
    return null

  const maybeError = (value as { error?: { message?: unknown } }).error
  if (maybeError && typeof maybeError.message === 'string')
    return maybeError.message

  return 'Provider request failed.'
}

export function unwrap<T>(value: T | unknown): T {
  const message = getProviderErrorMessage(value)
  if (message)
    throw new Error(message)
  return value as T
}

export function toMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message
  return String(error)
}

/** "NQ07 0000 0000 ..." -> "NQ07 0000 … 0000" */
export function shortenAddress(address: string): string {
  const compact = address.replace(/\s+/g, '')
  if (compact.length <= 12)
    return address
  return `${compact.slice(0, 4)} ${compact.slice(4, 8)} … ${compact.slice(-4)}`
}

/**
 * Waits for Nimiq Pay to inject the provider. Rejects after `timeout` ms so a
 * normal desktop browser falls back to the "Open in Nimiq Pay" state instead of
 * hanging forever.
 */
export function connect(timeout = 3000): Promise<NimiqProvider> {
  return init({ timeout })
}

export async function listAccounts(nimiq: NimiqProvider): Promise<string[]> {
  return unwrap<string[]>(await nimiq.listAccounts())
}

/** Sends a NIM tip and returns the transaction hash. */
export async function sendTip(
  nimiq: NimiqProvider,
  recipient: string,
  nim: number,
): Promise<string> {
  return unwrap<string>(
    await nimiq.sendBasicTransaction({
      recipient,
      value: nimToLuna(nim),
    }),
  )
}

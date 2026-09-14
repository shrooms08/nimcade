import { requestDeviceIdentifier } from '@nimiq/mini-app-sdk'

const KEY = 'nimcade:device-id'
const REASON = 'Enter your scores in the Nimcade Daily Cup'

/** The device id from an earlier Cup entry, without prompting. */
export function knownDeviceId(): string | null {
  try {
    return localStorage.getItem(KEY)
  }
  catch {
    return null
  }
}

let pending: Promise<string> | null = null

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Nimiq Pay's per-app device identifier (64 hex characters; the first call asks the player).
 * Outside Nimiq Pay, a random id of the same shape kept on this device. Rejects when the
 * player declines, and can be retried.
 */
export function getDeviceId(): Promise<string> {
  const known = knownDeviceId()
  if (known)
    return Promise.resolve(known)
  pending ??= (window.nimiqPay?.requestDeviceIdentifier ? requestDeviceIdentifier({ reason: REASON }) : Promise.resolve(randomId()))
    .then((id) => {
      try {
        localStorage.setItem(KEY, id.toLowerCase())
      }
      catch {
        // Storage unavailable: ask again next time.
      }
      return id.toLowerCase()
    })
    .finally(() => {
      pending = null
    })
  return pending
}

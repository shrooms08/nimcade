import { useSyncExternalStore } from 'react'
import { getName, subscribeName } from './profile'

/** The saved display name (or null), re-rendering whenever it changes. */
export function usePlayerName(): string | null {
  return useSyncExternalStore(subscribeName, getName, () => null)
}

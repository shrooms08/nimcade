import { useSyncExternalStore } from 'react'
import { isMuted, subscribeMuted } from './sound'

/** Re-renders the mute controls when the sound is muted or unmuted, here or in another tab. */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, isMuted, () => false)
}

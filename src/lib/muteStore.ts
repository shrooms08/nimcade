/** The mute flag, kept on this device. sound.ts re-exports this as its public mute API. */

const MUTED_KEY = 'nimcade:muted'

function read(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  }
  catch {
    return false
  }
}

let muted = read()
const listeners = new Set<() => void>()

export const isMuted = () => muted

export function setMuted(next: boolean) {
  muted = next
  try {
    localStorage.setItem(MUTED_KEY, next ? '1' : '0')
  }
  catch {
    // Storage unavailable: the choice lasts this session.
  }
  listeners.forEach(listener => listener())
}

export const toggleMuted = () => setMuted(!muted)

/** Subscribe for useSyncExternalStore; also follows changes from another tab. */
export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === MUTED_KEY) {
      muted = read()
      listener()
    }
  }
  if (typeof window !== 'undefined')
    window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined')
      window.removeEventListener('storage', onStorage)
  }
}

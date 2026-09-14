import { validateName } from '../../supabase/functions/_shared/playerName.ts'

/**
 * The player's display name, kept on this device. The Daily Cup sends it with each signed
 * score entry (src/lib/cupEntry.ts); submit-score applies the same validation server-side.
 */

export { NAME_MAX_LENGTH, NAME_MIN_LENGTH, validateName } from '../../supabase/functions/_shared/playerName.ts'
export type { NameCheck } from '../../supabase/functions/_shared/playerName.ts'

const NAME_KEY = 'nimcade:name'
/** Set once the first game over has offered to add a name, whether it was saved or skipped. */
const PROMPTED_KEY = 'nimcade:name-prompted'

/** Used when localStorage is unavailable (some WebViews), so the name still lasts the session. */
let memoryName: string | null = null
const listeners = new Set<() => void>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  }
  catch {
    // Storage unavailable: the in-memory copy covers this session.
  }
}

/** The saved display name, or null when the player hasn't set one. */
export function getName(): string | null {
  const saved = read(NAME_KEY) ?? memoryName
  return saved !== null && validateName(saved).ok ? saved : null
}

/** Validates and saves a display name; returns the check so the caller can show the error. */
export function setName(input: string) {
  const check = validateName(input)
  if (check.ok) {
    memoryName = check.name
    write(NAME_KEY, check.name)
    listeners.forEach(listener => listener())
  }
  return check
}

/** Calls `listener` when the name changes, in this tab or another. Returns the unsubscribe. */
export function subscribeName(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === NAME_KEY)
      listener()
  }
  if (typeof window !== 'undefined')
    window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined')
      window.removeEventListener('storage', onStorage)
  }
}

/** Whether a game over has already offered to add a name. */
export const namePromptSeen = () => read(PROMPTED_KEY) === '1'
export const markNamePromptSeen = () => write(PROMPTED_KEY, '1')

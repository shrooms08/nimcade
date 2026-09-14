/**
 * The player's display name, kept on this device until the Cup backend exists.
 * TODO(backend): the leaderboard client attaches getName() to every score submission
 * (the hook is the round report in src/components/GameCard.tsx).
 */

const NAME_KEY = 'nimcade:name'
/** Set once the first game over has offered to add a name, whether it was saved or skipped. */
const PROMPTED_KEY = 'nimcade:name-prompted'

export const NAME_MIN_LENGTH = 3
export const NAME_MAX_LENGTH = 16

const ALLOWED = /^[\p{L}\p{N}_ ]+$/u
/** Blocked anywhere in the name, once spaces and underscores are dropped and look-alike digits read as letters. */
const BLOCKED_ANYWHERE = ['nigger', 'nigga', 'faggot', 'retard', 'tranny']
/** Blocked only as a whole word, so ordinary words that contain them (raccoon, spice) stay allowed. */
const BLOCKED_WORDS = ['fag', 'fags', 'kike', 'spic', 'chink', 'coon', 'dyke']
const LOOKALIKE: Record<string, string> = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' }

export type NameCheck = { ok: true; name: string } | { ok: false; error: string }

/** Trims the input and checks length, characters and the blocklist. */
export function validateName(input: string): NameCheck {
  const name = input.trim()
  const length = Array.from(name).length
  if (length < NAME_MIN_LENGTH || length > NAME_MAX_LENGTH)
    return { ok: false, error: `Use ${NAME_MIN_LENGTH} to ${NAME_MAX_LENGTH} characters.` }
  if (!ALLOWED.test(name))
    return { ok: false, error: 'Use letters, numbers, spaces and underscores only.' }
  const words = name.toLowerCase().replace(/[013457]/g, digit => LOOKALIKE[digit]).split(/[\s_]+/)
  const compact = words.join('')
  if (BLOCKED_ANYWHERE.some(word => compact.includes(word)) || words.some(word => BLOCKED_WORDS.includes(word)))
    return { ok: false, error: 'Please choose a different name.' }
  return { ok: true, name }
}

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
export function setName(input: string): NameCheck {
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

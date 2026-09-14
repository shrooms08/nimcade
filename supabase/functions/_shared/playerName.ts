/**
 * Display name rules, shared by the client (inline validation) and submit-score (which stores
 * the name next to the score): 3 to 16 characters after trimming, letters, numbers, spaces and
 * underscores, and a small blocklist of obvious slurs.
 */

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

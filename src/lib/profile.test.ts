import { afterEach, describe, expect, it, vi } from 'vitest'
import { getName, markNamePromptSeen, NAME_MAX_LENGTH, NAME_MIN_LENGTH, namePromptSeen, setName, subscribeName, validateName } from './profile'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, String(value)) },
    removeItem: (key: string) => { map.delete(key) },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validateName', () => {
  it('accepts 3 to 16 characters, trimmed', () => {
    expect(NAME_MIN_LENGTH).toBe(3)
    expect(NAME_MAX_LENGTH).toBe(16)
    expect(validateName('abc')).toEqual({ ok: true, name: 'abc' })
    expect(validateName('a'.repeat(16))).toEqual({ ok: true, name: 'a'.repeat(16) })
    expect(validateName('   minos  ')).toEqual({ ok: true, name: 'minos' })
  })

  it('rejects 2 and 17 characters', () => {
    expect(validateName('ab')).toEqual({ ok: false, error: 'Use 3 to 16 characters.' })
    expect(validateName('a'.repeat(17))).toEqual({ ok: false, error: 'Use 3 to 16 characters.' })
    expect(validateName('  ab  ').ok).toBe(false)
  })

  it('allows letters, numbers, spaces and underscores only', () => {
    expect(validateName('mi nos_99').ok).toBe(true)
    expect(validateName('José').ok).toBe(true)
    expect(validateName('mi-nos')).toEqual({ ok: false, error: 'Use letters, numbers, spaces and underscores only.' })
    expect(validateName('minos!').ok).toBe(false)
  })

  it('blocks slurs, also spaced, underscored or written with digits, but not words that merely contain short ones', () => {
    expect(validateName('r3tard').ok).toBe(false)
    expect(validateName('re_tard 99').ok).toBe(false)
    expect(validateName('big spic').ok).toBe(false)
    expect(validateName('Raccoon').ok).toBe(true)
    expect(validateName('spice girl').ok).toBe(true)
  })
})

describe('stored name', () => {
  it('saves a valid name, notifies subscribers and ignores invalid ones', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    const listener = vi.fn()
    const unsubscribe = subscribeName(listener)
    expect(getName()).toBeNull()
    expect(setName('  minos ')).toEqual({ ok: true, name: 'minos' })
    expect(getName()).toBe('minos')
    expect(localStorage.getItem('nimcade:name')).toBe('minos')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(setName('mi').ok).toBe(false)
    expect(getName()).toBe('minos')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('remembers that the game over prompt was shown', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(namePromptSeen()).toBe(false)
    markNamePromptSeen()
    expect(namePromptSeen()).toBe(true)
  })
})

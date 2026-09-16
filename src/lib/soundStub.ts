import { vi } from 'vitest'

/**
 * A Web Audio stand-in for the sound engine's tests: it records what the engine builds, starts
 * and resumes. Used only by src/lib/sound*.test.ts; nothing in the app imports it.
 */

class FakeParam {
  value = 1
  setTargetAtTime = vi.fn()
}

class FakeNode {
  disconnected = false
  connect(destination: unknown) {
    return destination
  }

  disconnect() {
    this.disconnected = true
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam()
}

export class FakeSource extends FakeNode {
  buffer: { duration?: number; length?: number } | null = null
  loop = false
  loopStart = 0
  loopEnd = 0
  playbackRate = new FakeParam()
  onended: (() => void) | null = null
  started = false
  stopped = false
  start() {
    this.started = true
  }

  stop() {
    this.stopped = true
  }
}

export class FakeContext {
  static instances: FakeContext[] = []
  state = 'running'
  currentTime = 0
  sampleRate = 44100
  destination = new FakeNode()
  sources: FakeSource[] = []
  gains: FakeGain[] = []
  resume = vi.fn(() => {
    this.state = 'running'
  })

  close = vi.fn(async () => {
    this.state = 'closed'
  })

  addEventListener = vi.fn()
  createBuffer = vi.fn((channels: number, length: number) => ({ length, channels, duration: length / 44100 }))

  constructor() {
    FakeContext.instances.push(this)
  }

  createGain() {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }

  createBufferSource() {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  }
}

/** What decoding returns; a test can swap this for a gated promise. */
export const offline = { decode: async (): Promise<{ duration: number }> => ({ duration: 1.494 }) }

export class FakeOffline {
  decodeAudioData = vi.fn(() => offline.decode())
}

export const listeners = new Map<string, Set<(event?: unknown) => void>>()
export const store = new Map<string, string>()
export const documentState = { visibilityState: 'visible' }

/** Installs the fakes as globals and clears anything left from the previous test. */
export function stubWindow() {
  FakeContext.instances = []
  listeners.clear()
  store.clear()
  documentState.visibilityState = 'visible'
  offline.decode = async () => ({ duration: 1.494 })

  const host = globalThis as Record<string, unknown>
  const add = (type: string, listener: (event?: unknown) => void) => {
    if (!listeners.has(type))
      listeners.set(type, new Set())
    listeners.get(type)!.add(listener)
  }
  const remove = (type: string, listener: (event?: unknown) => void) => listeners.get(type)?.delete(listener)
  host.AudioContext = FakeContext
  host.OfflineAudioContext = FakeOffline
  host.window = globalThis
  host.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  }
  host.addEventListener = add
  host.removeEventListener = remove
  host.document = {
    get visibilityState() {
      return documentState.visibilityState
    },
    addEventListener: add,
    removeEventListener: remove,
  }
  host.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
}

/** Fires a window or document event the engine listens for. */
export const fire = (type: string) => listeners.get(type)?.forEach(listener => listener())
export const gesture = () => fire('pointerdown')
export const context = () => FakeContext.instances.at(-1)!
/** Sources the engine actually started on the newest context. */
export const started = () => context().sources.filter(source => source.started)

/** Loads a fresh copy of the engine with its buffers already decoded. */
export async function loadSound() {
  vi.resetModules()
  const sound = await import('./sound')
  await sound.preloadSounds()
  return sound
}

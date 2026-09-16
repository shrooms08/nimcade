import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A Web Audio stand-in: records what the engine builds and starts. */
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

class FakeGain extends FakeNode {
  gain = new FakeParam()
}

class FakeSource extends FakeNode {
  buffer: { duration: number } | null = null
  loop = false
  loopStart = 0
  loopEnd = 0
  playbackRate = new FakeParam()
  onended: (() => void) | null = null
  started = false
  stopped = false
  gain: FakeGain | null = null
  start() {
    this.started = true
  }

  stop() {
    this.stopped = true
  }
}

class FakeContext {
  static instances: FakeContext[] = []
  state = 'running'
  currentTime = 0
  destination = new FakeNode()
  sources: FakeSource[] = []
  gains: FakeGain[] = []
  resume = vi.fn(() => {
    this.state = 'running'
  })

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

class FakeOffline {
  decodeAudioData = vi.fn(async () => ({ duration: 1.494 }))
}

const listeners = new Map<string, Set<(event?: unknown) => void>>()
const store = new Map<string, string>()

function stubWindow() {
  const host = globalThis as Record<string, unknown>
  host.AudioContext = FakeContext
  host.OfflineAudioContext = FakeOffline
  host.window = globalThis
  host.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  }
  host.addEventListener = (type: string, listener: (event?: unknown) => void) => {
    if (!listeners.has(type))
      listeners.set(type, new Set())
    listeners.get(type)!.add(listener)
  }
  host.removeEventListener = (type: string, listener: (event?: unknown) => void) => listeners.get(type)?.delete(listener)
  host.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
}

const gesture = () => listeners.get('pointerdown')?.forEach(listener => listener())
const context = () => FakeContext.instances.at(-1)!
/** Sources the engine actually started, ignoring the master gain node. */
const started = () => context().sources.filter(source => source.started)

async function load() {
  vi.resetModules()
  const sound = await import('./sound')
  await sound.preloadSounds()
  return sound
}

beforeEach(() => {
  FakeContext.instances = []
  listeners.clear()
  store.clear()
  stubWindow()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sound engine', () => {
  it('decodes every cue once, in parallel, without a gesture', async () => {
    const sound = await load()
    const files = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url))
    expect(files).toHaveLength(16)
    expect(files.filter(url => url.endsWith('/sfx/tap.ogg'))).toHaveLength(1)
    expect(files.some(url => url.endsWith('/sfx/boost-hum.ogg'))).toBe(true)
    // Decoding happens off an OfflineAudioContext: no AudioContext exists yet.
    expect(FakeContext.instances).toHaveLength(0)
    sound.play('tap')
    expect(FakeContext.instances).toHaveLength(0)
  })

  it('never plays before a user gesture, and plays after one', async () => {
    const sound = await load()
    sound.armAudio()
    sound.play('tap')
    expect(FakeContext.instances).toHaveLength(0)

    gesture()
    expect(FakeContext.instances).toHaveLength(1)
    sound.play('tap')
    expect(started()).toHaveLength(1)
    expect(started()[0].buffer).toEqual({ duration: 1.494 })
  })

  it('varies the pitch of rapid cues by up to 4%, and leaves the others alone', async () => {
    const sound = await load()
    sound.armAudio()
    gesture()
    for (const cue of ['tap', 'eat', 'coin'] as const) {
      const before = started().length
      sound.play(cue)
      const rate = started()[before].playbackRate.value
      expect(rate).toBeGreaterThanOrEqual(0.96)
      expect(rate).toBeLessThanOrEqual(1.04)
    }
    const before = started().length
    sound.play('perfect')
    expect(started()[before].playbackRate.value).toBe(1)

    const rates = new Set<number>()
    for (let i = 0; i < 6; i++) {
      started().forEach(source => source.onended?.())
      sound.play('tap')
      rates.add(started().at(-1)!.playbackRate.value)
    }
    expect(rates.size).toBeGreaterThan(1)
  })

  it('plays at most 8 voices at once, and frees them as they end', async () => {
    const sound = await load()
    sound.armAudio()
    gesture()
    for (let i = 0; i < 12; i++)
      sound.play('score')
    expect(started()).toHaveLength(8)

    started().slice(0, 3).forEach(source => source.onended?.())
    sound.play('score')
    expect(started()).toHaveLength(9)
  })

  it('loops the boost hum inside the padded window and fades it out', async () => {
    const sound = await load()
    sound.armAudio()
    gesture()
    sound.setBoostHum(true)
    const hum = started().at(-1)!
    expect(hum.loop).toBe(true)
    expect(hum.loopStart).toBeCloseTo(0.02, 3)
    expect(hum.loopEnd).toBeCloseTo(0.02 + 64139 / 44100, 3)
    expect(context().gains.at(-1)!.gain.setTargetAtTime).toHaveBeenCalled()

    sound.setBoostHum(true) // holding again doesn't stack a second loop
    expect(started().filter(source => source.loop)).toHaveLength(1)
    sound.setBoostHum(false)
    expect(hum.stopped).toBe(true)
  })

  it('mutes, remembers the choice, and stops the hum', async () => {
    const sound = await load()
    sound.armAudio()
    gesture()
    const changes = vi.fn()
    sound.subscribeMuted(changes)

    sound.setBoostHum(true)
    const hum = started().at(-1)!
    sound.toggleMuted()
    expect(sound.isMuted()).toBe(true)
    expect(store.get('nimcade:muted')).toBe('1')
    expect(changes).toHaveBeenCalled()
    expect(hum.stopped).toBe(true)

    const before = started().length
    sound.play('tap')
    expect(started()).toHaveLength(before)

    sound.toggleMuted()
    expect(sound.isMuted()).toBe(false)
    expect(store.get('nimcade:muted')).toBe('0')
    sound.play('tap')
    expect(started().length).toBeGreaterThan(before)
  })

  it('starts muted when that was the saved choice', async () => {
    store.set('nimcade:muted', '1')
    const sound = await load()
    sound.armAudio()
    gesture()
    expect(sound.isMuted()).toBe(true)
    sound.play('tap')
    expect(FakeContext.instances.flatMap(ctx => ctx.sources).filter(source => source.started)).toHaveLength(0)
  })

  it('stays silent instead of throwing when audio is unavailable', async () => {
    const host = globalThis as Record<string, unknown>
    host.fetch = vi.fn(async () => { throw new Error('offline') })
    const sound = await load()
    delete host.AudioContext
    sound.armAudio()
    expect(() => gesture()).not.toThrow()
    expect(() => sound.play('tap')).not.toThrow()
    expect(() => sound.setBoostHum(true)).not.toThrow()
    expect(() => sound.setMuted(true)).not.toThrow()
    await expect(sound.preloadSounds()).resolves.toBeUndefined()
  })
})

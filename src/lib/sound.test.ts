import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { context, FakeContext, gesture, loadSound, started, store, stubWindow } from './soundStub'

beforeEach(stubWindow)
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('sound engine', () => {
  it('decodes every cue once, in parallel, without a gesture', async () => {
    const sound = await loadSound()
    const files = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url))
    expect(files).toHaveLength(18)
    expect(files.filter(url => url.endsWith('/sfx/tap.ogg'))).toHaveLength(1)
    expect(files.some(url => url.endsWith('/sfx/boost-hum.ogg'))).toBe(true)
    expect(files.some(url => url.endsWith('/sfx/dodge-flip.ogg'))).toBe(true)
    // Decoding happens off an OfflineAudioContext: no AudioContext exists yet.
    expect(FakeContext.instances).toHaveLength(0)
    sound.play('tap')
    expect(FakeContext.instances).toHaveLength(0)
  })

  it('never plays before a user gesture, and plays after one', async () => {
    const sound = await loadSound()
    sound.armAudio()
    sound.play('tap')
    expect(FakeContext.instances).toHaveLength(0)

    gesture()
    expect(FakeContext.instances).toHaveLength(1)
    sound.play('tap')
    expect(started().some(source => source.buffer?.duration === 1.494)).toBe(true)
  })

  it('varies the pitch of rapid cues by up to 4%, and leaves the others alone', async () => {
    const sound = await loadSound()
    sound.armAudio()
    gesture()
    for (const cue of ['tap', 'eat', 'coin', 'dodge-flip'] as const) {
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
    const sound = await loadSound()
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
    const sound = await loadSound()
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
    const sound = await loadSound()
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
    const sound = await loadSound()
    sound.armAudio()
    gesture()
    expect(sound.isMuted()).toBe(true)
    sound.play('tap')
    expect(FakeContext.instances.flatMap(ctx => ctx.sources).filter(source => source.started)).toHaveLength(0)
  })

  it('stays silent instead of throwing when audio is unavailable', async () => {
    const host = globalThis as Record<string, unknown>
    host.fetch = vi.fn(async () => { throw new Error('offline') })
    const sound = await loadSound()
    delete host.AudioContext
    sound.armAudio()
    expect(() => gesture()).not.toThrow()
    expect(() => sound.play('tap')).not.toThrow()
    expect(() => sound.setBoostHum(true)).not.toThrow()
    expect(() => sound.setMuted(true)).not.toThrow()
    await expect(sound.preloadSounds()).resolves.toBeUndefined()
  })
})

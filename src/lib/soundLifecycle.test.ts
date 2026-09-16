import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { context, documentState, FakeContext, fire, gesture, loadSound, offline, started, stubWindow } from './soundStub'

/**
 * The WebView parks, interrupts and occasionally kills the audio context. These cover the
 * recovery paths: resume on a gesture, resume on waking up, and the short queue that covers
 * cues fired while the buffers are still decoding.
 */

beforeEach(stubWindow)
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function armed() {
  const sound = await loadSound()
  sound.armAudio()
  gesture()
  return sound
}

/** Parks the context the way a WebView does and forgets the calls made so far. */
function park(state: 'suspended' | 'interrupted') {
  const ctx = context()
  ctx.state = state
  ctx.resume.mockClear()
  ctx.createBuffer.mockClear()
  return ctx
}

describe('audio context lifecycle', () => {
  it('resumes and unlocks a suspended context on the next gesture', async () => {
    await armed()
    const ctx = park('suspended')

    gesture()
    expect(ctx.resume).toHaveBeenCalled()
    // resume() alone can leave a WebView silent: a one-sample buffer is what unlocks output.
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 1, 44100)
    expect(started().at(-1)!.buffer).toMatchObject({ length: 1 })
    expect(FakeContext.instances).toHaveLength(1) // resumed, not replaced
  })

  it('treats an interrupted context the same as a suspended one', async () => {
    await armed()
    const ctx = park('interrupted')

    fire('touchstart')
    expect(ctx.resume).toHaveBeenCalled()
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 1, 44100)
  })

  it('resumes when the page becomes visible, is focused, or is restored', async () => {
    await armed()

    for (const [event, setup] of [
      ['visibilitychange', () => { documentState.visibilityState = 'visible' }],
      ['focus', () => {}],
      ['pageshow', () => {}],
    ] as const) {
      const ctx = park('suspended')
      setup()
      fire(event)
      expect(ctx.resume, `${event} should resume`).toHaveBeenCalled()
    }
  })

  it('ignores a visibility change while the page is hidden', async () => {
    await armed()
    const ctx = park('suspended')
    documentState.visibilityState = 'hidden'

    fire('visibilitychange')
    expect(ctx.resume).not.toHaveBeenCalled()
  })

  it('never creates the context from a wake-up alone: that still needs a gesture', async () => {
    const sound = await loadSound()
    sound.armAudio()

    documentState.visibilityState = 'visible'
    fire('visibilitychange')
    fire('focus')
    fire('pageshow')
    expect(FakeContext.instances).toHaveLength(0)

    gesture()
    expect(FakeContext.instances).toHaveLength(1)
  })

  it('rebuilds the context after a play fails, on the next gesture', async () => {
    const sound = await armed()
    const first = context()
    first.createBufferSource = () => { throw new Error('context died') }
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    sound.play('tap')
    expect(FakeContext.instances).toHaveLength(1)

    gesture()
    expect(FakeContext.instances).toHaveLength(2)
    expect(first.close).toHaveBeenCalled()
    // The rebuild re-decodes into the new context, so cues work again once that finishes.
    await sound.preloadSounds()
    sound.play('tap')
    expect(started().length).toBeGreaterThan(0)
  })

  it('stops using a closed context and replaces it', async () => {
    const sound = await armed()
    const first = context()
    first.state = 'closed'

    sound.play('tap')
    expect(first.sources.filter(source => source.started)).toHaveLength(0)
    gesture()
    expect(FakeContext.instances).toHaveLength(2)
  })
})

describe('cues fired while the buffers are still decoding', () => {
  /** Holds decoding open so cues can be fired mid-load. */
  async function gatedLoad() {
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    offline.decode = async () => {
      await gate
      return { duration: 1.494 }
    }
    vi.resetModules()
    const sound = await import('./sound')
    sound.armAudio()
    gesture()
    const loaded = sound.preloadSounds()
    return { sound, release, loaded }
  }

  it('plays a cue queued moments ago, and drops one that went stale', async () => {
    vi.useFakeTimers()
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { sound, release, loaded } = await gatedLoad()

    sound.play('tap') // queued now
    vi.advanceTimersByTime(500)
    sound.play('score') // queued 500 ms later, so it is the fresh one
    expect(started()).toHaveLength(0)

    release()
    await loaded
    expect(started()).toHaveLength(1)
    expect(info.mock.calls.flat().join(' ')).toContain('dropped tap')
  })

  it('plays everything queued inside the window', async () => {
    vi.useFakeTimers()
    const { sound, release, loaded } = await gatedLoad()

    sound.play('tap')
    vi.advanceTimersByTime(100)
    sound.play('score')
    release()
    await loaded
    expect(started()).toHaveLength(2)
  })

  it('queues nothing once the buffers are ready', async () => {
    const sound = await armed()
    sound.play('tap')
    expect(started()).toHaveLength(1)
  })
})

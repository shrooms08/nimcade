import { armAudioContext, audioContext, audioLog, audioMaster, audioState, markAudioBroken } from './audioContext'
import { isMuted, subscribeMuted } from './muteStore'

/**
 * Game audio: samples in public/sfx (see CREDITS.md) decoded into Web Audio buffers.
 *
 * The context is created on the first user gesture, so nothing can play before one, and it is
 * resumed on every later gesture and wake-up (see audioContext.ts). Every entry point is
 * guarded: if audio is unavailable, or a cue hasn't loaded, calls do nothing.
 */

export type Cue =
  | 'tap' | 'score' | 'perfect' | 'wave' | 'power' | 'eat' | 'eat-chaser' | 'fail'
  | 'coin' | 'tick' | 'countdown-beep' | 'countdown-go' | 'swipe' | 'tip-success' | 'new-best'
  // Dodge has its own flip and pickup, gentler than the shared tap and coin.
  | 'dodge-flip' | 'dodge-coin'

/** The looping boost hum, faded in and out with Void Run's hold. */
const BOOST_HUM = 'boost-hum'
type Sample = Cue | typeof BOOST_HUM

const MAX_VOICES = 8
/** Cues that can repeat within a few hundred ms get ±4% pitch so they don't sound mechanical. */
const VARIED: ReadonlySet<Cue> = new Set<Cue>(['tap', 'eat', 'coin', 'dodge-flip', 'dodge-coin'])
const PITCH_VARIATION = 0.04
const HUM_FADE_IN_MS = 120
const HUM_FADE_OUT_MS = 200
/** A cue asked for before its buffer was ready is worth playing only this late. */
const QUEUE_MAX_AGE_MS = 300

/**
 * Per-cue trim. Repeating cues sit at 0.4 (Dodge's own pair lower still), chimes and one-off
 * effects at 0.7, jingles at 0.75. (Measured loudness per file is in public/sfx/CREDITS.md.)
 */
const CUE_GAIN: Record<Sample, number> = {
  'tap': 0.4,
  'score': 0.4,
  'eat': 0.4,
  'coin': 0.4,
  'tick': 0.4,
  'swipe': 0.4,
  'dodge-flip': 0.35,
  'dodge-coin': 0.35,
  'perfect': 0.7,
  'wave': 0.7,
  'power': 0.7,
  'eat-chaser': 0.7,
  'fail': 0.7,
  'countdown-beep': 0.7,
  'countdown-go': 0.7,
  'tip-success': 0.75,
  'new-best': 0.75,
  'boost-hum': 0.3,
}

/**
 * The hum file carries 20 ms of the loop's own tail before it and head after it, because Vorbis
 * rings at the file edges and trims samples off the end. Looping this exact window instead of
 * the whole buffer keeps the wrap inside clean, phase-aligned audio: no click each cycle.
 */
const HUM_LOOP_START = 0.02
const HUM_LOOP_SECONDS = 64139 / 44100

const SAMPLES = Object.keys(CUE_GAIN) as Sample[]
const buffers = new Map<Sample, AudioBuffer>()
/** Cues asked for while the buffers were still decoding, with when they were asked for. */
const queued: { cue: Cue; at: number }[] = []

let voices = 0
let loading: Promise<void> | null = null
let hum: { source: AudioBufferSourceNode; gain: GainNode } | null = null
let humWanted = false

/** Starts listening for gestures and wake-ups; a rebuilt context gets freshly decoded buffers. */
export function armAudio() {
  armAudioContext(() => {
    buffers.clear()
    loading = null
    hum = null
    voices = 0
    void preloadSounds()
  })
}

/** Plays whatever was asked for while the buffers were loading, if it is still fresh. */
function flushQueue() {
  const at = Date.now()
  for (const item of queued.splice(0, queued.length)) {
    const age = at - item.at
    if (age < QUEUE_MAX_AGE_MS)
      play(item.cue)
    else
      audioLog(`dropped ${item.cue}, queued ${age}ms ago`)
  }
}

/**
 * Fetches and decodes every sample in parallel. Decoding uses an OfflineAudioContext, so it
 * needs no gesture, and the buffers play through the live context later. Failures are ignored:
 * a cue that didn't load simply stays silent.
 */
export function preloadSounds(): Promise<void> {
  if (loading)
    return loading
  if (typeof window === 'undefined' || typeof fetch !== 'function')
    return Promise.resolve()
  let decoder: BaseAudioContext | null = null
  try {
    const Offline = window.OfflineAudioContext ?? (window as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    decoder = Offline ? new Offline(1, 1, 44100) : audioContext(false)
  }
  catch {
    decoder = null
  }
  if (!decoder)
    return Promise.resolve()

  const base = `${import.meta.env.BASE_URL}sfx/`
  loading = Promise.all(SAMPLES.map(async (name) => {
    try {
      const response = await fetch(`${base}${name}.ogg`)
      if (!response.ok)
        return
      const data = await response.arrayBuffer()
      buffers.set(name, await decoder.decodeAudioData(data))
    }
    catch {
      // One missing cue shouldn't stop the others.
    }
  })).then(() => {
    flushQueue()
    if (humWanted)
      startHum()
  })
  return loading
}

/** Plays a cue. Silent when muted, before the first gesture, or when the sample isn't loaded. */
export function play(cue: Cue) {
  if (isMuted())
    return
  const buffer = buffers.get(cue)
  if (!buffer) {
    // Still decoding: hold it briefly so an early tap isn't simply lost.
    if (loading)
      queued.push({ cue, at: Date.now() })
    return
  }
  // No context yet means no gesture yet: never play before one. This also resumes a parked one.
  const context = audioContext(false)
  const master = audioMaster()
  if (!context || !master)
    return
  try {
    if (voices >= MAX_VOICES)
      return
    const source = context.createBufferSource()
    source.buffer = buffer
    if (VARIED.has(cue))
      source.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH_VARIATION
    const gain = context.createGain()
    gain.gain.value = CUE_GAIN[cue]
    source.connect(gain).connect(master)
    voices += 1
    source.onended = () => {
      voices = Math.max(0, voices - 1)
      try {
        source.disconnect()
        gain.disconnect()
      }
      catch {
        // Already torn down.
      }
    }
    source.start()
  }
  catch (error) {
    // Audio is a nicety; never let it break a round. The next gesture rebuilds the context.
    markAudioBroken()
    if (import.meta.env.DEV)
      console.warn(`sound: ${cue} failed`, error)
  }
}

function startHum() {
  const buffer = buffers.get(BOOST_HUM)
  const context = audioContext(false)
  const master = audioMaster()
  if (hum || isMuted() || !buffer || !context || !master)
    return
  try {
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    if (buffer.duration > HUM_LOOP_START + HUM_LOOP_SECONDS) {
      source.loopStart = HUM_LOOP_START
      source.loopEnd = HUM_LOOP_START + HUM_LOOP_SECONDS
    }
    const gain = context.createGain()
    gain.gain.value = 0
    source.connect(gain).connect(master)
    source.start()
    gain.gain.setTargetAtTime(CUE_GAIN[BOOST_HUM], context.currentTime, HUM_FADE_IN_MS / 3000)
    hum = { source, gain }
  }
  catch {
    hum = null
  }
}

function stopHum() {
  const current = hum
  const context = audioContext(false)
  if (!current || !context)
    return
  hum = null
  try {
    const end = context.currentTime + HUM_FADE_OUT_MS / 1000
    current.gain.gain.setTargetAtTime(0, context.currentTime, HUM_FADE_OUT_MS / 3000)
    current.source.stop(end)
    current.source.onended = () => {
      try {
        current.source.disconnect()
        current.gain.disconnect()
      }
      catch {
        // Already torn down.
      }
    }
  }
  catch {
    // Nothing to stop.
  }
}

/** Fades the boost hum in while the hold is on, and out when it ends. */
export function setBoostHum(on: boolean) {
  humWanted = on
  try {
    if (on)
      startHum()
    else
      stopHum()
  }
  catch {
    // Ignore.
  }
}

// Muting stops the hum; unmuting brings it back if the hold is still on.
subscribeMuted(() => {
  if (isMuted())
    stopHum()
  else if (humWanted)
    startHum()
})

// Dev-only handle for automated checks; stripped from production builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const host = window as typeof window & { __nimcade?: Record<string, unknown> }
  host.__nimcade = {
    ...host.__nimcade,
    sound: () => ({ ...audioState(), buffers: buffers.size, muted: isMuted(), voices, humWanted, hum: hum !== null, queued: queued.length }),
  }
}

export { isMuted, setMuted, subscribeMuted, toggleMuted } from './muteStore'

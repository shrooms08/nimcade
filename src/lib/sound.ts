/**
 * Game audio: CC0 samples (public/sfx, see CREDITS.md) decoded into Web Audio buffers.
 *
 * The context is created on the first user gesture, so nothing can play before one. Buffers are
 * decoded off the audio context after the splash, in parallel, and never block the feed. Every
 * entry point is guarded: if audio is unavailable, or a cue hasn't loaded, calls do nothing.
 */

export type Cue =
  | 'tap' | 'score' | 'perfect' | 'wave' | 'power' | 'eat' | 'eat-chaser' | 'fail'
  | 'coin' | 'tick' | 'countdown-beep' | 'countdown-go' | 'swipe' | 'tip-success' | 'new-best'

/** The looping boost hum, faded in and out with Void Run's hold. */
const BOOST_HUM = 'boost-hum'
type Sample = Cue | typeof BOOST_HUM

const MASTER_GAIN = 0.6
const MAX_VOICES = 8
/** Cues that can repeat within a few hundred ms get ±4% pitch so they don't sound mechanical. */
const VARIED: ReadonlySet<Cue> = new Set<Cue>(['tap', 'eat', 'coin'])
const PITCH_VARIATION = 0.04
const HUM_FADE_IN_MS = 120
const HUM_FADE_OUT_MS = 200
const MUTED_KEY = 'nimcade:muted'

/**
 * Per-cue trim. The files are normalised to -16 LUFS where a cue is long enough to carry it;
 * the very short transients are peak-limited well below that, so they get more gain here.
 * (Measured LUFS per file is in public/sfx/CREDITS.md.)
 */
const CUE_GAIN: Record<Sample, number> = {
  'tap': 0.45,
  'score': 0.6,
  'perfect': 0.7,
  'wave': 0.7,
  'power': 0.7,
  'eat': 0.4,
  'eat-chaser': 0.8,
  'fail': 0.85,
  'coin': 0.6,
  'tick': 0.85,
  'countdown-beep': 0.75,
  'countdown-go': 0.85,
  'swipe': 0.5,
  'tip-success': 0.8,
  'new-best': 0.85,
  'boost-hum': 0.3,
}

/**
 * The hum file carries 20 ms of the loop's own tail before it and head after it, because Vorbis
 * rings at the file edges and trims samples off the end. Looping this exact window instead of
 * the whole buffer keeps the wrap inside clean, phase-aligned audio: no click each cycle.
 */
const HUM_LOOP_START = 0.02
const HUM_LOOP_SECONDS = 41375 / 44100

const SAMPLES = Object.keys(CUE_GAIN) as Sample[]
const buffers = new Map<Sample, AudioBuffer>()

let context: AudioContext | null = null
let master: GainNode | null = null
let voices = 0
let loading: Promise<void> | null = null
let hum: { source: AudioBufferSourceNode; gain: GainNode } | null = null
let humWanted = false

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  }
  catch {
    return false
  }
}

let muted = readMuted()
const mutedListeners = new Set<() => void>()

/** Creates the context on a user gesture, or resumes it after the browser suspended it. */
function ready(): AudioContext | null {
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor)
        return null
      context = new Ctor()
      master = context.createGain()
      master.gain.value = MASTER_GAIN
      master.connect(context.destination)
    }
    if (context.state === 'suspended')
      void context.resume()
    return context
  }
  catch {
    return null
  }
}

/** Starts the context on the first gesture; the listeners remove themselves. */
export function armAudio() {
  if (typeof window === 'undefined')
    return
  const start = () => {
    ready()
    for (const event of ['pointerdown', 'touchend', 'keydown'])
      window.removeEventListener(event, start)
  }
  for (const event of ['pointerdown', 'touchend', 'keydown'])
    window.addEventListener(event, start, { passive: true })
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
    decoder = Offline ? new Offline(1, 1, 44100) : ready()
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
    if (humWanted)
      startHum()
  })
  return loading
}

/** Plays a cue. Silent when muted, before the first gesture, or when the sample isn't loaded. */
export function play(cue: Cue) {
  if (muted)
    return
  try {
    const buffer = buffers.get(cue)
    // No context yet means no gesture yet: never play before one.
    if (!buffer || !context || !master || voices >= MAX_VOICES)
      return
    if (context.state === 'suspended')
      void context.resume()
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
    // Audio is a nicety; never let it break a round.
    if (import.meta.env.DEV)
      console.warn(`sound: ${cue} failed`, error)
  }
}

function startHum() {
  const buffer = buffers.get(BOOST_HUM)
  if (hum || muted || !buffer || !context || !master)
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

// Dev-only handle for automated checks; stripped from production builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const host = window as typeof window & { __nimcade?: Record<string, unknown> }
  host.__nimcade = { ...host.__nimcade, sound: () => ({ buffers: buffers.size, context: context !== null, master: master !== null, muted, voices, humWanted, hum: hum !== null }) }
}

export const isMuted = () => muted

export function setMuted(next: boolean) {
  muted = next
  try {
    localStorage.setItem(MUTED_KEY, next ? '1' : '0')
  }
  catch {
    // Storage unavailable: the choice lasts this session.
  }
  if (next)
    stopHum()
  else if (humWanted)
    startHum()
  mutedListeners.forEach(listener => listener())
}

export const toggleMuted = () => setMuted(!muted)

/** Subscribe for useSyncExternalStore; also follows changes from another tab. */
export function subscribeMuted(listener: () => void): () => void {
  mutedListeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === MUTED_KEY) {
      muted = readMuted()
      listener()
    }
  }
  if (typeof window !== 'undefined')
    window.addEventListener('storage', onStorage)
  return () => {
    mutedListeners.delete(listener)
    if (typeof window !== 'undefined')
      window.removeEventListener('storage', onStorage)
  }
}

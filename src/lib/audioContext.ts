/**
 * The audio context's lifecycle, kept apart from the cues themselves.
 *
 * A WebView parks the context freely — backgrounded, a call, another app taking audio — and it
 * comes back "suspended" or, on iOS, "interrupted". Every gesture and every wake-up therefore
 * resumes it and pushes a one-sample silent buffer through, which is what actually unlocks
 * output. A context that dies is thrown away and rebuilt on the next gesture.
 */

const MASTER_GAIN = 0.6

let context: AudioContext | null = null
let master: GainNode | null = null
/** Set when the context dies or a call throws; the next gesture rebuilds everything. */
let broken = false
let armed = false
let reloadBuffers: (() => void) | null = null

export const audioLog = (message: string) => {
  if (import.meta.env.DEV)
    console.info(`sound: ${message}`)
}

/** iOS says "interrupted" (a call, another app) where the others say "suspended". */
const parked = (ctx: AudioContext) => ctx.state !== 'running' && ctx.state !== 'closed'

/** A one-sample silent buffer: resume() alone often leaves a WebView muted until something plays. */
function unlock(ctx: AudioContext) {
  try {
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    source.connect(ctx.destination)
    source.start()
  }
  catch {
    // Unlocking is best effort.
  }
}

function build(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor)
    return null
  const ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  master.connect(ctx.destination)
  ctx.addEventListener?.('statechange', () => audioLog(`context ${ctx.state}`))
  audioLog(`context created (${ctx.state})`)
  return ctx
}

/** Throws the dead context away; the caller's buffers are decoded again for the new one. */
function rebuild() {
  audioLog('rebuilding the audio context')
  try {
    void context?.close()
  }
  catch {
    // Already gone.
  }
  context = null
  master = null
  broken = false
  reloadBuffers?.()
}

/**
 * The live context, resumed and unlocked. `allowCreate` is true for user gestures only: waking
 * up from the background must never be what first creates it.
 */
export function audioContext(allowCreate: boolean): AudioContext | null {
  try {
    if (broken) {
      if (!allowCreate)
        return null
      rebuild()
    }
    if (!context) {
      if (!allowCreate)
        return null
      context = build()
    }
    if (!context)
      return null
    if (context.state === 'closed') {
      broken = true
      return null
    }
    if (parked(context)) {
      void context.resume()
      unlock(context)
    }
    return context
  }
  catch (error) {
    broken = true
    audioLog(`context unusable: ${String(error)}`)
    return null
  }
}

export const audioMaster = () => master
export const markAudioBroken = () => {
  broken = true
}

/** For the dev handle: what the engine currently has. */
export const audioState = () => ({ context: context !== null, state: context?.state ?? null, master: master !== null, broken })

/**
 * Resumes on every gesture and every wake-up; the listeners stay for the life of the page.
 * `onRebuild` re-decodes the buffers after a dead context was replaced.
 */
export function armAudioContext(onRebuild: () => void) {
  reloadBuffers = onRebuild
  if (typeof window === 'undefined' || armed)
    return
  armed = true
  const onGesture = () => audioContext(true)
  for (const type of ['pointerdown', 'touchstart', 'keydown'])
    window.addEventListener(type, onGesture, { capture: true, passive: true })
  // Coming back from the background: resume what exists, never create it here.
  const onWake = () => {
    if (audioState().context)
      audioContext(false)
  }
  window.addEventListener('focus', onWake)
  window.addEventListener('pageshow', onWake)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible')
        onWake()
    })
  }
}

import type { Sprite } from './shared/sprites'

export { imageSprite } from './shared/sprites'

type Rgb = [number, number, number]
const hex = (value: string): Rgb => [1, 3, 5].map(i => Number.parseInt(value.slice(i, i + 2), 16)) as Rgb
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)]
  return `rgb(${x.map((c, i) => Math.round(c + (y[i] - c) * Math.min(1, Math.max(0, t)))).join(', ')})`
}
const px = (n: number) => Math.max(1, Math.round(n))

/** Sky keyframes by floor: dawn, day, sunset, night. Each holds, then blends over the last SKY_BLEND floors. */
const SKY = [
  { floor: 0, top: '#3b3f7a', bottom: '#f4a57a' },
  { floor: 15, top: '#3f8fd9', bottom: '#b9e3ff' },
  { floor: 40, top: '#5a3f8a', bottom: '#ff8a4c' },
  { floor: 70, top: '#070a1f', bottom: '#1b2350' },
]
const SKY_BLEND = 4
/** Deterministic star field in 0..1 coordinates. */
const STARS = Array.from({ length: 40 }, (_, i) => [((i * 7919) % 997) / 997, ((i * 104729) % 991) / 991 * 0.8])

/** Night-sky star visibility for a floor count: 0 until the sunset-to-night blend, 1 at night. */
export const starAlpha = (floors: number) => Math.min(1, Math.max(0, (floors - (SKY[3].floor - SKY_BLEND)) / SKY_BLEND))

/** Gradient sky; `count` is the floor count, which picks dawn, day, sunset or night. */
const sky: Sprite = (ctx, x, y, width, height, state) => {
  const floors = state.count
  let i = SKY.length - 1
  while (i > 0 && floors < SKY[i].floor - SKY_BLEND) i--
  const from = SKY[Math.max(0, i - 1)], to = SKY[i]
  const t = i === 0 ? 1 : (floors - (to.floor - SKY_BLEND)) / SKY_BLEND
  const gradient = ctx.createLinearGradient(0, y, 0, y + height)
  gradient.addColorStop(0, mix(from.top, to.top, t))
  gradient.addColorStop(1, mix(from.bottom, to.bottom, t))
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, width, height)

  const stars = starAlpha(floors)
  if (stars > 0) {
    const size = px(width / 160)
    STARS.forEach(([sx, sy], n) => {
      ctx.globalAlpha = stars * (0.55 + 0.45 * Math.sin(state.time / 480 + n))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(Math.round(x + sx * width), Math.round(y + sy * height), size, size)
    })
    ctx.globalAlpha = 1
  }
}

/** A blocky cloud filling its box. */
const cloud: Sprite = (ctx, x, y, width, height, state) => {
  const u = width / 8
  ctx.globalAlpha = state.alpha
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)'
  ctx.fillRect(Math.round(x + u), Math.round(y + height * 0.4), Math.round(u * 6), Math.round(height * 0.6))
  ctx.fillRect(Math.round(x + u * 2), Math.round(y + height * 0.15), Math.round(u * 3), Math.round(height * 0.3))
  ctx.fillRect(Math.round(x + u * 4), Math.round(y), Math.round(u * 2.5), Math.round(height * 0.45))
  ctx.globalAlpha = 1
}

/** A small pixel bird; wings flap with time. */
const bird: Sprite = (ctx, x, y, width, _height, state) => {
  const u = px(width / 5)
  const up = Math.floor(state.time / 160) % 2 === 0
  ctx.fillStyle = '#1c1f2b'
  ctx.fillRect(Math.round(x + u * 2), Math.round(y + u * 2), u, u)
  const wingY = Math.round(y + (up ? u : u * 3))
  ctx.fillRect(Math.round(x), wingY, u * 2, u)
  ctx.fillRect(Math.round(x + u * 3), wingY, u * 2, u)
}

/** Asphalt street with a curb and a dashed centre line. */
const street: Sprite = (ctx, x, y, width, height) => {
  ctx.fillStyle = '#2d2f38'
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = '#8a8f99'
  ctx.fillRect(x, y, width, px(height * 0.12))
  ctx.fillStyle = '#e9d27a'
  const dash = px(width / 14)
  for (let dx = dash / 2; dx < width; dx += dash * 2)
    ctx.fillRect(Math.round(x + dx), Math.round(y + height * 0.55), dash, px(height * 0.08))
}

/** The foundation slab the first floor lands on. */
const slab: Sprite = (ctx, x, y, width, height) => {
  ctx.fillStyle = '#77716a'
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
  ctx.fillStyle = '#5a554f'
  ctx.fillRect(Math.round(x), Math.round(y + height * 0.7), Math.round(width), px(height * 0.3))
  ctx.fillStyle = '#9c968e'
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), px(height * 0.12))
}

/** Facade, shade, ledge per tone; floors alternate `variant` 0 and 1. */
const FACADES: [string, string, string][] = [['#b8603f', '#8e4630', '#e0a07e'], ['#6f7d99', '#56617a', '#aab6cc']]

/**
 * A building floor: facade, a thin ledge on top, and a row of `count` windows
 * that light up warm yellow as `glow` rises.
 */
const floor: Sprite = (ctx, x, y, width, height, state) => {
  const w = Math.max(1, Math.round(width * state.scale))
  const h = Math.max(1, Math.round(height * state.scale))
  const left = Math.round(x + (width - w) / 2)
  const top = Math.round(y + (height - h) / 2)
  const [face, shade, ledge] = FACADES[state.variant % 2]

  ctx.globalAlpha = state.alpha
  ctx.fillStyle = face
  ctx.fillRect(left, top, w, h)
  ctx.fillStyle = shade
  ctx.fillRect(left, top + h - px(h * 0.14), w, px(h * 0.14))
  ctx.fillStyle = ledge
  ctx.fillRect(left, top, w, px(h * 0.1))

  const winH = px(h * 0.36)
  const winW = px(winH * 1.1)
  let n = state.count
  while (n > 0 && n * winW + (n + 1) > w) n--
  const gap = (w - n * winW) / (n + 1)
  const winTop = top + Math.round(h * 0.34)
  for (let i = 0; i < n; i++) {
    const wx = Math.round(left + gap + i * (winW + gap))
    if (state.glow > 0) {
      ctx.fillStyle = `rgba(255, 205, 90, ${0.5 * state.glow})`
      ctx.fillRect(wx - 2, winTop - 2, winW + 4, winH + 4)
    }
    ctx.fillStyle = mix('#28304c', '#ffd766', state.glow)
    ctx.fillRect(wx, winTop, winW, winH)
  }
  ctx.globalAlpha = 1
}

/** The crane's yellow lattice arm across the top. */
const craneArm: Sprite = (ctx, x, y, width, height) => {
  ctx.fillStyle = '#e9b213'
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
  ctx.fillStyle = '#9a7409'
  const u = px(height / 3)
  for (let dx = 0; dx < width; dx += u * 4) {
    ctx.fillRect(Math.round(x + dx), Math.round(y + u), u, u)
    ctx.fillRect(Math.round(x + dx + u * 2), Math.round(y + u), u, u)
  }
  ctx.fillRect(Math.round(x), Math.round(y + height - u), Math.round(width), u)
}

const trolley: Sprite = (ctx, x, y, width, height) => {
  ctx.fillStyle = '#343a4f'
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
  ctx.fillStyle = '#c9ced8'
  const wheel = px(height * 0.35)
  ctx.fillRect(Math.round(x + width * 0.15), Math.round(y - wheel / 2), wheel, wheel)
  ctx.fillRect(Math.round(x + width * 0.85 - wheel), Math.round(y - wheel / 2), wheel, wheel)
}

/** A thin cable down the middle of its box. */
const cable: Sprite = (ctx, x, y, width, height) => {
  ctx.fillStyle = '#1c1f2b'
  const thick = px(width)
  ctx.fillRect(Math.round(x + (width - thick) / 2), Math.round(y), thick, Math.round(height))
}

/** A pixel hook. */
const hook: Sprite = (ctx, x, y, width, height) => {
  const u = px(width / 4)
  ctx.fillStyle = '#c9ced8'
  ctx.fillRect(Math.round(x + u), Math.round(y), u * 2, u)
  ctx.fillRect(Math.round(x + u * 2), Math.round(y + u), u, Math.round(height - u * 2))
  ctx.fillRect(Math.round(x), Math.round(y + height - u), u * 3, u)
}

/** "PERFECT" (plus "+N" when `count` holds a bonus), popping with `scale` and fading with `alpha`. */
const perfect: Sprite = (ctx, x, y, width, height, state) => {
  const size = Math.round(height * state.scale)
  ctx.globalAlpha = state.alpha
  ctx.font = `800 ${size}px ui-monospace, Menlo, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const text = state.count > 0 ? `PERFECT +${state.count}` : 'PERFECT'
  ctx.lineWidth = Math.max(2, size / 6)
  ctx.strokeStyle = '#3a1d05'
  ctx.strokeText(text, x + width / 2, y + height / 2)
  ctx.fillStyle = '#ffd766'
  ctx.fillText(text, x + width / 2, y + height / 2)
  ctx.globalAlpha = 1
}

const CONFETTI = ['#ffd766', '#ff6b8b', '#21bca5', '#0582ca', '#b06cff', '#ffffff']

/** One confetti pixel; `variant` picks its colour. */
const confetti: Sprite = (ctx, x, y, width, height, state) => {
  ctx.globalAlpha = state.alpha
  ctx.fillStyle = CONFETTI[state.variant % CONFETTI.length]
  ctx.fillRect(Math.round(x), Math.round(y), px(width), px(height))
  ctx.globalAlpha = 1
}

/** A height marker pennant; `count` is the floor number. */
const marker: Sprite = (ctx, x, y, width, height, state) => {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fillRect(Math.round(x + width - 2), Math.round(y), 2, Math.round(height))
  ctx.fillRect(Math.round(x + width * 0.45), Math.round(y), Math.round(width * 0.55), Math.round(height * 0.35))
  ctx.font = `700 ${Math.round(height * 0.45)}px ui-monospace, Menlo, monospace`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText(String(state.count), Math.round(x + width * 0.4), Math.round(y))
}

/** Swap any entry for `imageSprite('/sprites/…png', fallback)` to use pixel art. */
export const sprites: Record<
  'sky' | 'cloud' | 'bird' | 'street' | 'slab' | 'floor' | 'craneArm' | 'trolley' | 'cable' | 'hook' | 'perfect' | 'confetti' | 'marker',
  Sprite
> = { sky, cloud, bird, street, slab, floor, craneArm, trolley, cable, hook, perfect, confetti, marker }

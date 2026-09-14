import { critter } from './shared/critter'
import type { Sprite } from './shared/sprites'

export { imageSprite } from './shared/sprites'

/** The dark verge either side of the road. */
const margin: Sprite = (ctx, x, y, width, height) => {
  ctx.fillStyle = '#090b1d'
  ctx.fillRect(x, y, width, height)
}

/** Asphalt with scrolling kerb stripes; `variant` is the distance travelled. */
const road: Sprite = (ctx, x, y, width, height, state) => {
  ctx.fillStyle = '#161a3a'
  ctx.fillRect(x, y, width, height)
  const kerb = Math.max(3, Math.round(width * 0.03))
  const stripe = 24
  const offset = Math.round(state.variant) % (stripe * 2)
  for (let top = -stripe * 2 + offset; top < height; top += stripe * 2) {
    ctx.fillStyle = '#2b3170'
    ctx.fillRect(x, y + top, kerb, stripe)
    ctx.fillRect(x + width - kerb, y + top, kerb, stripe)
  }
}

/** One lane-divider dash. */
const dash: Sprite = (ctx, x, y, width, height) => {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(2, Math.round(width)), Math.round(height))
}

/** A striped road barrier. */
const barrier: Sprite = (ctx, x, y, width, height, state) => {
  const left = Math.round(x)
  const top = Math.round(y)
  const w = Math.round(width)
  const h = Math.round(height)
  const stripe = Math.max(4, Math.round(w / 6))

  ctx.globalAlpha = state.alpha
  ctx.fillStyle = '#d94432'
  ctx.fillRect(left, top, w, h)
  ctx.fillStyle = '#f4f4f4'
  for (let i = 0; i < w; i += stripe * 2)
    ctx.fillRect(left + i, top + Math.round(h * 0.3), Math.min(stripe, w - i), Math.round(h * 0.4))
  ctx.fillStyle = '#8f2518'
  ctx.fillRect(left, top + h - Math.max(2, Math.round(h * 0.15)), w, Math.max(2, Math.round(h * 0.15)))
  ctx.globalAlpha = 1
}

/** A square gold coin that flips edge-on as it spins. */
const coin: Sprite = (ctx, x, y, width, height, state) => {
  const size = Math.min(width, height) * 0.5 * state.scale
  const spin = Math.abs(Math.cos(state.time / 180))
  const w = Math.max(2, Math.round(size * (0.25 + 0.75 * spin)))
  const h = Math.round(size)
  const left = Math.round(x + (width - w) / 2)
  const top = Math.round(y + (height - h) / 2)

  ctx.globalAlpha = state.alpha
  ctx.fillStyle = '#e9b213'
  ctx.fillRect(left, top, w, h)
  ctx.fillStyle = '#fff1a8'
  ctx.fillRect(left, top, Math.max(1, Math.round(w * 0.3)), Math.max(1, Math.round(h * 0.3)))
  ctx.fillStyle = '#b37d0e'
  ctx.fillRect(left, top + h - Math.max(1, Math.round(h * 0.15)), w, Math.max(1, Math.round(h * 0.15)))
  ctx.globalAlpha = 1
}

/** Swap any entry for `imageSprite('/sprites/…png', fallback)` to use pixel art. */
export const sprites: Record<'margin' | 'road' | 'dash' | 'barrier' | 'coin' | 'player', Sprite> = {
  margin,
  road,
  dash,
  barrier,
  coin,
  player: critter,
}

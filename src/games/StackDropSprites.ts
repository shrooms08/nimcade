import type { Sprite } from './shared/sprites'

export { imageSprite } from './shared/sprites'

const BLOCK_COLORS = ['#ec991c', '#21bca5', '#0582ca', '#e9b213', '#ff6b8b', '#8b6cff']

/** Mixes a hex colour toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const target = amount > 0 ? 255 : 0
  const mix = (channel: number) => Math.round(channel + (target - channel) * Math.abs(amount))
  const r = mix((value >> 16) & 255)
  const g = mix((value >> 8) & 255)
  const b = mix(value & 255)
  return `rgb(${r}, ${g}, ${b})`
}

/** Night sky; `variant` is the camera height so the bands drift as it rises. */
const sky: Sprite = (ctx, x, y, width, height, state) => {
  ctx.fillStyle = '#0c0e24'
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = '#151a3d'
  const band = 48
  const offset = Math.round(state.variant * 0.35) % (band * 2)
  for (let top = -band * 2 + offset; top < height; top += band * 2)
    ctx.fillRect(x, y + top, width, band)
}

const ground: Sprite = (ctx, x, y, width, height) => {
  ctx.fillStyle = '#2b3170'
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = '#3c4394'
  ctx.fillRect(x, y, width, Math.max(2, Math.round(height * 0.12)))
}

/** A chunky pixel block; `variant` picks its colour, so the tower stripes. */
const block: Sprite = (ctx, x, y, width, height, state) => {
  const w = Math.max(1, Math.round(width * state.scale))
  const h = Math.max(1, Math.round(height * state.scale))
  const left = Math.round(x + (width - w) / 2)
  const top = Math.round(y + (height - h) / 2)
  const color = BLOCK_COLORS[((state.variant % BLOCK_COLORS.length) + BLOCK_COLORS.length) % BLOCK_COLORS.length]
  const edge = Math.max(2, Math.round(h * 0.18))

  ctx.globalAlpha = state.alpha
  ctx.fillStyle = color
  ctx.fillRect(left, top, w, h)
  ctx.fillStyle = shade(color, 0.35)
  ctx.fillRect(left, top, w, edge)
  ctx.fillStyle = shade(color, -0.3)
  ctx.fillRect(left, top + h - edge, w, edge)
  ctx.globalAlpha = 1
}

/** White overlay for a perfect placement; `alpha` carries the fade. */
const perfect: Sprite = (ctx, x, y, width, height, state) => {
  ctx.globalAlpha = state.alpha
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
  ctx.globalAlpha = 1
}

/** Swap any entry for `imageSprite('/sprites/…png', fallback)` to use pixel art. */
export const sprites: Record<'sky' | 'ground' | 'block' | 'perfect', Sprite> = {
  sky,
  ground,
  block,
  perfect,
}

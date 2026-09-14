import { critter } from './shared/critter'
import type { Sprite } from './shared/sprites'

export { imageSprite } from './shared/sprites'

export const palette = {
  floor: '#0c0e24',
  wall: '#2b3170',
  wallEdge: '#3c4394',
  dot: '#e9b213',
  core: '#10122b',
  coin: '#e9b213',
  coinEdge: '#b37d0e',
  coinShine: '#fff1a8',
}

/** Fill and outline per chaser `variant`: 0-2 the three chasers, 3 spooked, 4 spooked and wearing off. */
export const CHASER_COLORS: [fill: string, edge: string][] = [
  ['#ff4f6d', '#b8263f'],
  ['#7ee04a', '#3f8f1d'],
  ['#b06cff', '#6d34b8'],
  ['#3a4bb0', '#1f2a70'],
  ['#dfe6ff', '#8f9bd0'],
]

const wall: Sprite = (ctx, x, y, width, height) => {
  ctx.fillStyle = palette.wall
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = palette.wallEdge
  const inset = Math.max(1, Math.round(width * 0.18))
  const size = Math.max(1, Math.round(width * 0.12))
  ctx.fillRect(x + inset, y + inset, size, size)
}

const dot: Sprite = (ctx, x, y, width, height, state) => {
  const size = Math.max(2, Math.round(width * 0.2 * state.scale))
  ctx.globalAlpha = state.alpha
  ctx.fillStyle = palette.dot
  ctx.fillRect(Math.round(x + (width - size) / 2), Math.round(y + (height - size) / 2), size, size)
  ctx.globalAlpha = 1
}

/** The letter N on a 5x5 pixel grid. */
const N_PIXELS = ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X']

/** A gold NIM coin with a pixel "N". */
const coin: Sprite = (ctx, x, y, width, height, state) => {
  const cx = x + width / 2
  const cy = y + height / 2
  const radius = Math.min(width, height) * 0.36 * state.scale
  const pulse = 1 + Math.sin(state.time / 160) * 0.05

  ctx.globalAlpha = state.alpha
  ctx.beginPath()
  ctx.arc(cx, cy, radius * pulse, 0, Math.PI * 2)
  ctx.fillStyle = palette.coin
  ctx.fill()
  ctx.lineWidth = Math.max(1, radius * 0.18)
  ctx.strokeStyle = palette.coinEdge
  ctx.stroke()

  const px = Math.max(1, Math.floor((radius * 1.1) / 5))
  const left = Math.round(cx - (px * 5) / 2)
  const top = Math.round(cy - (px * 5) / 2)
  ctx.fillStyle = palette.core
  N_PIXELS.forEach((line, row) => {
    for (let col = 0; col < 5; col++) {
      if (line[col] === 'X')
        ctx.fillRect(left + col * px, top + row * px, px, px)
    }
  })
  ctx.fillStyle = palette.coinShine
  ctx.fillRect(Math.round(cx - radius * 0.55), Math.round(cy - radius * 0.6), px, px)
  ctx.globalAlpha = 1
}

/** A spiky diamond: long points on the axes, shorter spikes on the diagonals. */
const chaser: Sprite = (ctx, x, y, width, height, state) => {
  const [fill, edge] = CHASER_COLORS[state.variant] ?? CHASER_COLORS[0]
  const cx = x + width / 2
  const cy = y + height / 2
  const outer = width * 0.5 * state.scale
  const spike = outer * 0.72
  const valley = outer * 0.38
  const wobble = Math.sin(state.time / 110) * 0.14

  ctx.globalAlpha = state.alpha
  ctx.beginPath()
  for (let i = 0; i < 16; i++) {
    const angle = wobble + (i * Math.PI) / 8 - Math.PI / 2
    const radius = i % 2 === 1 ? valley : i % 4 === 0 ? outer : spike
    const vx = cx + Math.cos(angle) * radius
    const vy = cy + Math.sin(angle) * radius
    if (i === 0)
      ctx.moveTo(vx, vy)
    else
      ctx.lineTo(vx, vy)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = Math.max(1, width * 0.06)
  ctx.strokeStyle = edge
  ctx.stroke()

  const core = Math.max(2, Math.round(width * 0.14))
  ctx.fillStyle = palette.core
  ctx.fillRect(Math.round(cx - core / 2), Math.round(cy - core / 2), core, core)
  ctx.globalAlpha = 1
}

/** Swap any entry for `imageSprite('/sprites/…png', fallback)` to use pixel art. */
export const sprites: Record<'wall' | 'dot' | 'coin' | 'player' | 'chaser', Sprite> = {
  wall,
  dot,
  coin,
  player: critter,
  chaser,
}

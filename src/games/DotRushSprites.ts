import { critter } from './shared/critter'
import type { Sprite } from './shared/sprites'

export { imageSprite } from './shared/sprites'

export const palette = {
  floor: '#0c0e24',
  wall: '#2b3170',
  wallEdge: '#3c4394',
  dot: '#e9b213',
  chaser: '#ff4f6d',
  chaserShade: '#b8263f',
  core: '#10122b',
}

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

/** A spiky diamond: long points on the axes, shorter spikes on the diagonals. */
const chaser: Sprite = (ctx, x, y, width, height, state) => {
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
  ctx.fillStyle = palette.chaser
  ctx.fill()
  ctx.lineWidth = Math.max(1, width * 0.06)
  ctx.strokeStyle = palette.chaserShade
  ctx.stroke()

  const core = Math.max(2, Math.round(width * 0.14))
  ctx.fillStyle = palette.core
  ctx.fillRect(Math.round(cx - core / 2), Math.round(cy - core / 2), core, core)
  ctx.globalAlpha = 1
}

/** Swap any entry for `imageSprite('/sprites/…png', fallback)` to use pixel art. */
export const sprites: Record<'wall' | 'dot' | 'player' | 'chaser', Sprite> = {
  wall,
  dot,
  player: critter,
  chaser,
}

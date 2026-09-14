import type { Dir, Sprite } from './sprites'

export const critterPalette = {
  body: '#3fd6b8',
  shade: '#23a58c',
  eye: '#10122b',
}

/** Eye positions on the critter's 5x5 pixel grid, per facing direction. */
const EYES: Record<Dir, [number, number][]> = {
  right: [[2, 1], [4, 1]],
  left: [[0, 1], [2, 1]],
  up: [[1, 0], [3, 0]],
  down: [[1, 2], [3, 2]],
}

/** A small square pixel critter with two eye pixels that look where it walks. */
export const critter: Sprite = (ctx, x, y, width, height, state) => {
  const box = Math.min(width, height)
  const px = Math.max(1, Math.floor((box * 0.72 * state.scale) / 5))
  const body = px * 5
  const left = Math.round(x + (width - body) / 2)
  const top = Math.round(y + (height - body) / 2)

  ctx.globalAlpha = state.alpha
  ctx.fillStyle = critterPalette.body
  ctx.fillRect(left, top, body, body - px)
  // Two stubby feet on the bottom pixel row.
  ctx.fillStyle = critterPalette.shade
  ctx.fillRect(left, top + body - px, px * 2, px)
  ctx.fillRect(left + px * 3, top + body - px, px * 2, px)

  // Blink for 120ms every 2.6s.
  if (state.time % 2600 >= 120) {
    ctx.fillStyle = critterPalette.eye
    for (const [col, row] of EYES[state.facing])
      ctx.fillRect(left + col * px, top + row * px, px, px)
  }
  ctx.globalAlpha = 1
}

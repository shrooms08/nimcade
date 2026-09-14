/**
 * Dot Rush sprites. Every visual in the maze is drawn through this object, so
 * swapping a shape for pixel art is a one-line change:
 *
 *   sprites.player = imageSprite('/sprites/critter.png', sprites.player)
 */

export type Dir = 'up' | 'down' | 'left' | 'right'

export interface SpriteState {
  /** Milliseconds since the round was created, for idle animation. */
  time: number
  facing: Dir
  /** 1 = fills its usual box inside the tile. */
  scale: number
  alpha: number
}

/** Draws one sprite into the tile whose top-left corner is (x, y), in CSS px. */
export type Sprite = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
  state: SpriteState,
) => void

export const palette = {
  floor: '#0c0e24',
  wall: '#2b3170',
  wallEdge: '#3c4394',
  dot: '#e9b213',
  critter: '#3fd6b8',
  critterShade: '#23a58c',
  eye: '#10122b',
  chaser: '#ff4f6d',
  chaserShade: '#b8263f',
}

const wall: Sprite = (ctx, x, y, tile) => {
  ctx.fillStyle = palette.wall
  ctx.fillRect(x, y, tile, tile)
  ctx.fillStyle = palette.wallEdge
  const inset = Math.max(1, Math.round(tile * 0.18))
  ctx.fillRect(x + inset, y + inset, Math.max(1, Math.round(tile * 0.12)), Math.max(1, Math.round(tile * 0.12)))
}

const dot: Sprite = (ctx, x, y, tile, state) => {
  const size = Math.max(2, Math.round(tile * 0.2 * state.scale))
  ctx.globalAlpha = state.alpha
  ctx.fillStyle = palette.dot
  ctx.fillRect(Math.round(x + (tile - size) / 2), Math.round(y + (tile - size) / 2), size, size)
  ctx.globalAlpha = 1
}

/** Eye positions on the critter's 5x5 pixel grid, per facing direction. */
const EYES: Record<Dir, [number, number][]> = {
  right: [[2, 1], [4, 1]],
  left: [[0, 1], [2, 1]],
  up: [[1, 0], [3, 0]],
  down: [[1, 2], [3, 2]],
}

/** A small square pixel critter with two eye pixels that look where it walks. */
const player: Sprite = (ctx, x, y, tile, state) => {
  const px = Math.max(1, Math.floor((tile * 0.72 * state.scale) / 5))
  const body = px * 5
  const left = Math.round(x + (tile - body) / 2)
  const top = Math.round(y + (tile - body) / 2)

  ctx.globalAlpha = state.alpha
  ctx.fillStyle = palette.critter
  ctx.fillRect(left, top, body, body - px)
  // Two stubby feet on the bottom pixel row.
  ctx.fillStyle = palette.critterShade
  ctx.fillRect(left, top + body - px, px * 2, px)
  ctx.fillRect(left + px * 3, top + body - px, px * 2, px)

  // Blink for 120ms every 2.6s.
  const blinking = state.time % 2600 < 120
  if (!blinking) {
    ctx.fillStyle = palette.eye
    for (const [col, row] of EYES[state.facing])
      ctx.fillRect(left + col * px, top + row * px, px, px)
  }
  ctx.globalAlpha = 1
}

/** A spiky diamond: long points on the axes, shorter spikes on the diagonals. */
const chaser: Sprite = (ctx, x, y, tile, state) => {
  const cx = x + tile / 2
  const cy = y + tile / 2
  const outer = tile * 0.5 * state.scale
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
  ctx.lineWidth = Math.max(1, tile * 0.06)
  ctx.strokeStyle = palette.chaserShade
  ctx.stroke()

  const core = Math.max(2, Math.round(tile * 0.14))
  ctx.fillStyle = palette.eye
  ctx.fillRect(Math.round(cx - core / 2), Math.round(cy - core / 2), core, core)
  ctx.globalAlpha = 1
}

export const sprites: Record<'wall' | 'dot' | 'player' | 'chaser', Sprite> = {
  wall,
  dot,
  player,
  chaser,
}

/**
 * Wraps a PNG as a sprite. Draws `fallback` until the image has loaded (or if
 * it fails), so the game never renders an empty tile.
 */
export function imageSprite(src: string, fallback: Sprite): Sprite {
  const image = new Image()
  image.src = src
  return (ctx, x, y, tile, state) => {
    if (!image.complete || image.naturalWidth === 0) {
      fallback(ctx, x, y, tile, state)
      return
    }
    const size = Math.round(tile * state.scale)
    ctx.globalAlpha = state.alpha
    ctx.drawImage(image, Math.round(x + (tile - size) / 2), Math.round(y + (tile - size) / 2), size, size)
    ctx.globalAlpha = 1
  }
}

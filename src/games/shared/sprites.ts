/**
 * Every game draws through a `sprites` object of these functions, so a shape
 * can be swapped for pixel art with one line:
 *
 *   sprites.player = imageSprite('/sprites/critter.png', sprites.player)
 */

export type Dir = 'up' | 'down' | 'left' | 'right'

export interface SpriteState {
  /** Milliseconds since the round was created, for idle animation. */
  time: number
  /** 1 = fills its usual box. */
  scale: number
  alpha: number
  facing: Dir
  /** Free per-game index, e.g. a colour step for stacked blocks. */
  variant: number
  /** Free per-game quantity, e.g. windows on a floor or a floor number. */
  count: number
  /** Highlight strength, 0 (none) to 1 (full), e.g. lit windows. */
  glow: number
}

/** Draws one sprite into the box whose top-left corner is (x, y), in CSS px. */
export type Sprite = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  state: SpriteState,
) => void

export function spriteState(time: number, patch: Partial<SpriteState> = {}): SpriteState {
  return { time, scale: 1, alpha: 1, facing: 'up', variant: 0, count: 0, glow: 0, ...patch }
}

/**
 * Wraps a PNG as a sprite. Draws `fallback` until the image has loaded (or if
 * it fails), so the game never renders an empty box.
 */
export function imageSprite(src: string, fallback: Sprite): Sprite {
  const image = new Image()
  image.src = src
  return (ctx, x, y, width, height, state) => {
    if (!image.complete || image.naturalWidth === 0) {
      fallback(ctx, x, y, width, height, state)
      return
    }
    const w = Math.round(width * state.scale)
    const h = Math.round(height * state.scale)
    ctx.globalAlpha = state.alpha
    ctx.drawImage(image, Math.round(x + (width - w) / 2), Math.round(y + (height - h) / 2), w, h)
    ctx.globalAlpha = 1
  }
}

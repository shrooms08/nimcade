import type { Sprite } from './shared/sprites'

export { imageSprite } from './shared/sprites'

/** The Void is white and grey only. */
const grey = (value: number, alpha = 1) => `rgba(${value}, ${value}, ${value}, ${alpha})`
const r = Math.round
const TEXT = 'ui-monospace, Menlo, monospace'

/** One star pixel; `variant` is its brightness (0-255). */
const star: Sprite = (ctx, x, y, width, height, state) => {
  ctx.fillStyle = grey(state.variant, state.alpha)
  ctx.fillRect(r(x), r(y), Math.max(1, r(width)), Math.max(1, r(height)))
}

/** A faint dithered tunnel ring; `glow` brightens it on a clean pass. */
const ring: Sprite = (ctx, x, y, width, height, state) => {
  ctx.setLineDash([1, 1])
  ctx.lineWidth = 1
  ctx.strokeStyle = grey(120 + 135 * state.glow, state.alpha)
  ctx.strokeRect(r(x) + 0.5, r(y) + 0.5, r(width), r(height))
  ctx.setLineDash([])
}

/** The tunnel mouth outline at depth 0. */
const frame: Sprite = (ctx, x, y, width, height, state) => {
  ctx.lineWidth = 1
  ctx.strokeStyle = grey(150 + 105 * state.glow)
  ctx.strokeRect(r(x) + 0.5, r(y) + 0.5, r(width), r(height))
}

/** A solid gate tile; `alpha` fades distant gates. */
const tile: Sprite = (ctx, x, y, width, height, state) => {
  ctx.fillStyle = grey(255, state.alpha)
  ctx.fillRect(r(x), r(y), Math.max(1, r(width)), Math.max(1, r(height)))
}

/** The thin square outline around a gate. */
const gateOutline: Sprite = (ctx, x, y, width, height, state) => {
  ctx.lineWidth = 1
  ctx.strokeStyle = grey(200, state.alpha)
  ctx.strokeRect(r(x) + 0.5, r(y) + 0.5, Math.max(1, r(width)), Math.max(1, r(height)))
}

/** The glowing ball; `variant` 1 draws the dark frame of a hit flash. */
const ball: Sprite = (ctx, x, y, width, height, state) => {
  const cx = x + width / 2, cy = y + height / 2, radius = (width / 2) * state.scale
  const halo: [number, number][] = [[2.2, 0.07], [1.7, 0.14], [1.3, 0.3]]
  for (const [k, a] of halo) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius * k, 0, Math.PI * 2)
    ctx.fillStyle = grey(255, a * state.alpha)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = state.variant === 1 ? grey(70) : grey(255)
  ctx.fill()
}

/** A shattered-gate fragment pixel. */
const fragment: Sprite = (ctx, x, y, width, height, state) => {
  ctx.fillStyle = grey(235, state.alpha)
  ctx.fillRect(r(x), r(y), Math.max(1, r(width)), Math.max(1, r(height)))
}

/** A shield diamond; `count` 1 is filled, 0 is an empty outline. */
const pip: Sprite = (ctx, x, y, width, height, state) => {
  ctx.beginPath()
  ctx.moveTo(x + width / 2, y)
  ctx.lineTo(x + width, y + height / 2)
  ctx.lineTo(x + width / 2, y + height)
  ctx.lineTo(x, y + height / 2)
  ctx.closePath()
  if (state.count > 0) {
    ctx.fillStyle = grey(255)
    ctx.fill()
  }
  else {
    ctx.lineWidth = 1
    ctx.strokeStyle = grey(110)
    ctx.stroke()
  }
}

/** The round BOOST button; `glow` 1 while boosting (inverted colours). */
const boostButton: Sprite = (ctx, x, y, width, height, state) => {
  const on = state.glow > 0
  ctx.beginPath()
  ctx.arc(x + width / 2, y + height / 2, width / 2, 0, Math.PI * 2)
  if (on) {
    ctx.fillStyle = grey(255)
    ctx.fill()
  }
  ctx.lineWidth = 1
  ctx.strokeStyle = grey(on ? 255 : 170)
  ctx.stroke()
  ctx.fillStyle = on ? grey(0) : grey(220)
  ctx.font = `700 ${Math.max(5, r(height * 0.22))}px ${TEXT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('BOOST', x + width / 2, y + height / 2 + 1)
}

/** The boost energy bar; `count` is the fill in percent. */
const boostBar: Sprite = (ctx, x, y, width, height, state) => {
  ctx.lineWidth = 1
  ctx.strokeStyle = grey(140)
  ctx.strokeRect(r(x) + 0.5, r(y) + 0.5, r(width), r(height))
  ctx.fillStyle = grey(state.glow > 0 ? 255 : 200)
  ctx.fillRect(r(x) + 2, r(y) + 2, Math.max(0, r(((width - 3) * state.count) / 100)), Math.max(1, r(height) - 3))
}

/** The multiplier readout; `count` is tenths (13 = x1.3). */
const multiplier: Sprite = (ctx, x, y, _width, height, state) => {
  ctx.fillStyle = grey(state.glow > 0 ? 255 : 200)
  ctx.font = `700 ${Math.max(5, r(height))}px ${TEXT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`x${(state.count / 10).toFixed(1)}`, r(x), r(y))
}

/** "STAGE N CLEAR" centred in its box; `count` is N. */
const banner: Sprite = (ctx, x, y, width, height, state) => {
  ctx.globalAlpha = state.alpha
  ctx.fillStyle = grey(0, 0.7)
  ctx.fillRect(r(x), r(y), r(width), r(height))
  ctx.fillStyle = grey(255)
  ctx.font = `800 ${Math.max(6, r(height * 0.5))}px ${TEXT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`STAGE ${state.count} CLEAR`, x + width / 2, y + height / 2 + 1)
  ctx.globalAlpha = 1
}

/** Swap any entry for `imageSprite('/sprites/…png', fallback)` to use pixel art. */
export const sprites: Record<
  'star' | 'ring' | 'frame' | 'tile' | 'gateOutline' | 'ball' | 'fragment' | 'pip' | 'boostButton' | 'boostBar' | 'multiplier' | 'banner',
  Sprite
> = { star, ring, frame, tile, gateOutline, ball, fragment, pip, boostButton, boostBar, multiplier, banner }

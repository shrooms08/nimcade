import type { Sprite } from './shared/sprites'

export { imageSprite } from './shared/sprites'

/** The app's UI font stack (see styles.css). */
const UI_FONT = '"Muli", "Nimiq", system-ui, -apple-system, "Segoe UI", sans-serif'
const white = (alpha: number) => `rgba(255, 255, 255, ${alpha})`
const TAU = Math.PI * 2
/** Canvas pixels per CSS px; shadowBlur ignores the transform, so it needs this. */
const deviceScale = (ctx: CanvasRenderingContext2D) => ctx.getTransform().a || 1

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, TAU)
}

/** Draws text centred on (cx, cy) with extra space between letters. */
function spacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, spacing: number) {
  const letters = [...text]
  const widths = letters.map(letter => ctx.measureText(letter).width)
  let x = cx - (widths.reduce((sum, w) => sum + w, 0) + spacing * (letters.length - 1)) / 2
  ctx.textAlign = 'left'
  letters.forEach((letter, i) => {
    ctx.fillText(letter, x, cy)
    x += widths[i] + spacing
  })
}

/** Black, with a barely lifted centre so the corners read darker. */
const background: Sprite = (ctx, x, y, width, height) => {
  const cx = x + width / 2, cy = y + height * 0.45
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(width, height) * 0.6)
  gradient.addColorStop(0, 'rgb(11, 11, 14)')
  gradient.addColorStop(0.55, 'rgb(4, 4, 5)')
  gradient.addColorStop(1, 'rgb(0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, width, height)
}

/** A small star; `alpha` is its brightness and `glow` > 0 adds a 1px twinkle cross. */
const star: Sprite = (ctx, x, y, width, _height, state) => {
  const cx = x + width / 2, cy = y + width / 2
  ctx.fillStyle = white(state.alpha)
  circle(ctx, cx, cy, width / 2)
  ctx.fill()
  if (state.glow > 0) {
    ctx.fillStyle = white(state.alpha * state.glow * 0.7)
    ctx.fillRect(cx - width * 2, cy - 0.5, width * 4, 1)
    ctx.fillRect(cx - 0.5, cy - width * 2, 1, width * 4)
  }
}

/** A thin tunnel ring; `alpha` carries its brightness. */
const ring: Sprite = (ctx, x, y, width, height, state) => {
  ctx.lineWidth = 1
  ctx.strokeStyle = white(state.alpha)
  ctx.strokeRect(x, y, width, height)
}

/** The tunnel mouth outline. */
const frame: Sprite = (ctx, x, y, width, height, state) => {
  ctx.lineWidth = 1
  ctx.strokeStyle = `rgba(222, 224, 230, ${state.alpha})`
  ctx.strokeRect(x, y, width, height)
}

/** A solid gate slab: white, faintly lit from the top, with a 1px darker edge. `alpha` dims distant gates. */
const tile: Sprite = (ctx, x, y, width, height, state) => {
  const gradient = ctx.createLinearGradient(0, y, 0, y + height)
  gradient.addColorStop(0, white(state.alpha))
  gradient.addColorStop(1, `rgba(206, 208, 216, ${state.alpha})`)
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, width, height)
  if (width > 2 && height > 2) {
    ctx.lineWidth = 1
    ctx.strokeStyle = `rgba(140, 142, 152, ${state.alpha})`
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
  }
}

/** The thin square outline around a gate. */
const gateOutline: Sprite = (ctx, x, y, width, height, state) => {
  ctx.lineWidth = 1
  ctx.strokeStyle = white(0.4 * state.alpha)
  ctx.strokeRect(x, y, width, height)
}

/**
 * The ball: a white core with a soft radial halo about 3x its radius and a
 * shadowBlur bloom. `glow` 1 while boosting intensifies both; `variant` 1 is
 * the dark frame of a hit flash. `count` 1 draws only the halo and 2 only the
 * core, so a boost trail can sit between them.
 */
const ball: Sprite = (ctx, x, y, width, _height, state) => {
  const cx = x + width / 2, cy = y + width / 2, radius = (width / 2) * state.scale
  if (state.count !== 2) {
    const reach = radius * (3 + 0.8 * state.glow)
    const strength = (0.3 + 0.3 * state.glow) * state.alpha
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, reach)
    halo.addColorStop(0, white(strength))
    halo.addColorStop(0.35, white(strength * 0.4))
    halo.addColorStop(1, white(0))
    ctx.fillStyle = halo
    circle(ctx, cx, cy, reach)
    ctx.fill()
  }
  if (state.count !== 1) {
    ctx.save()
    ctx.shadowColor = white(0.9 * state.alpha)
    ctx.shadowBlur = radius * (1.1 + state.glow) * deviceScale(ctx)
    ctx.fillStyle = state.variant === 1 ? `rgba(96, 98, 108, ${state.alpha})` : white(state.alpha)
    circle(ctx, cx, cy, radius)
    ctx.fill()
    ctx.restore()
  }
}

/** One fading copy in the boost trail: a soft-edged core without the halo. */
const trail: Sprite = (ctx, x, y, width, _height, state) => {
  const cx = x + width / 2, cy = y + width / 2, radius = (width / 2) * state.scale
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.15)
  core.addColorStop(0, white(state.alpha))
  core.addColorStop(0.7, white(state.alpha * 0.8))
  core.addColorStop(1, white(0))
  ctx.fillStyle = core
  circle(ctx, cx, cy, radius * 1.15)
  ctx.fill()
}

/** A white shard from a shattered gate, lit like the slabs; `variant` is its rotation in degrees. */
const fragment: Sprite = (ctx, x, y, width, height, state) => {
  ctx.save()
  ctx.translate(x + width / 2, y + height / 2)
  ctx.rotate((state.variant * Math.PI) / 180)
  const gradient = ctx.createLinearGradient(0, -height / 2, 0, height / 2)
  gradient.addColorStop(0, white(state.alpha))
  gradient.addColorStop(1, `rgba(196, 198, 208, ${state.alpha})`)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(0, -height / 2)
  ctx.lineTo(width / 2, height / 2)
  ctx.lineTo(-width / 2, height * 0.25)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** A shield diamond; `count` 1 is filled, 0 an empty outline. */
const pip: Sprite = (ctx, x, y, width, height, state) => {
  ctx.beginPath()
  ctx.moveTo(x + width / 2, y)
  ctx.lineTo(x + width, y + height / 2)
  ctx.lineTo(x + width / 2, y + height)
  ctx.lineTo(x, y + height / 2)
  ctx.closePath()
  if (state.count > 0) {
    ctx.fillStyle = white(0.95)
    ctx.fill()
  }
  else {
    ctx.lineWidth = 1
    ctx.strokeStyle = white(0.35)
    ctx.stroke()
  }
}

/** The round BOOST button; `glow` 1 while boosting. */
const boostButton: Sprite = (ctx, x, y, width, height, state) => {
  const cx = x + width / 2, cy = y + height / 2, radius = width / 2
  const on = state.glow > 0
  circle(ctx, cx, cy, radius)
  if (on) {
    const fill = ctx.createRadialGradient(cx, cy - radius * 0.3, 0, cx, cy, radius)
    fill.addColorStop(0, white(1))
    fill.addColorStop(1, 'rgba(214, 216, 224, 1)')
    ctx.fillStyle = fill
  }
  else {
    ctx.fillStyle = white(0.04)
  }
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = white(on ? 0.9 : 0.4)
  ctx.stroke()
  ctx.fillStyle = on ? 'rgb(12, 12, 16)' : white(0.8)
  ctx.font = `700 ${height * 0.2}px ${UI_FONT}`
  ctx.textBaseline = 'middle'
  spacedText(ctx, 'BOOST', cx, cy + 0.5, height * 0.02)
}

/** The boost energy bar; `count` is the fill in percent, `glow` 1 while boosting. */
const boostBar: Sprite = (ctx, x, y, width, height, state) => {
  ctx.fillStyle = white(0.08)
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = white(state.glow > 0 ? 1 : 0.75)
  ctx.fillRect(x, y, (width * state.count) / 100, height)
  ctx.lineWidth = 1
  ctx.strokeStyle = white(0.25)
  ctx.strokeRect(x, y, width, height)
}

/** The multiplier readout; `count` is tenths (13 = x1.3), `glow` brightens it on a pass. */
const multiplier: Sprite = (ctx, x, y, _width, height, state) => {
  ctx.fillStyle = white(0.7 + 0.3 * state.glow)
  ctx.font = `700 ${height}px ${UI_FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`x${(state.count / 10).toFixed(1)}`, x, y)
}

/** "STAGE N CLEAR", letter-spaced and centred in its box; `count` is N, `alpha` carries the fade. */
const banner: Sprite = (ctx, x, y, width, height, state) => {
  const band = ctx.createLinearGradient(x, 0, x + width, 0)
  band.addColorStop(0, 'rgba(0, 0, 0, 0)')
  band.addColorStop(0.5, `rgba(0, 0, 0, ${0.65 * state.alpha})`)
  band.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = band
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = white(state.alpha)
  ctx.font = `700 ${height * 0.42}px ${UI_FONT}`
  ctx.textBaseline = 'middle'
  spacedText(ctx, `STAGE ${state.count} CLEAR`, x + width / 2, y + height / 2, height * 0.16)
}

/** Swap any entry for `imageSprite('/sprites/…png', fallback)` to use pixel art. */
export const sprites: Record<
  'background' | 'star' | 'ring' | 'frame' | 'tile' | 'gateOutline' | 'ball' | 'trail' | 'fragment' | 'pip' | 'boostButton' | 'boostBar' | 'multiplier' | 'banner',
  Sprite
> = { background, star, ring, frame, tile, gateOutline, ball, trail, fragment, pip, boostButton, boostBar, multiplier, banner }

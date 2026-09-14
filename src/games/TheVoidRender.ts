import { spriteState } from './shared/sprites'
import type { BoardView } from './shared/useCanvasBoard'
import { sprites } from './TheVoidSprites'
import {
  AREA_H, AREA_W, BALL_RADIUS, BOOST_BAR, BOOST_BUTTON, BOOST_RADIUS, FRAGMENT_MS, GRID,
  isBoosting, MOUTH_HALF, MOUTH_X, MOUTH_Y, PULSE_MS, START_SHIELDS,
} from './TheVoidWorld'
import type { World } from './TheVoidWorld'

/** Pixels are drawn at 1/PIXEL of the canvas resolution, then scaled up unsmoothed for a chunky look. */
const PIXEL = 2
/** One-point perspective: a square at depth z is 1 / (1 + z * DEPTH_K) the size of the mouth. */
const DEPTH_K = 7
/** How deep the wall lines and rings reach. */
const TUNNEL_FAR = 4
const RING_GAP = 0.25
/** The vanishing point shifts against the ball by this share of the mouth size, for parallax. */
const VP_DRIFT = 0.12
const STAR_PARALLAX = 6
const STARS = Array.from({ length: 36 }, (_, i) => ({
  x: (((i * 7919) % 997) / 997) * AREA_W,
  y: (((i * 104729) % 991) / 991) * AREA_H,
  brightness: 90 + ((i * 37) % 150),
}))
const PIP = 10
const FRAGMENT_PX = 2
const FLASH_BLINK_MS = 60

/** Creates a renderer with its own half-resolution buffer. */
export function createRenderer() {
  let buffer: HTMLCanvasElement | null = null

  return function drawTheVoid(ctx: CanvasRenderingContext2D, view: BoardView, world: World) {
    const bw = Math.max(1, Math.round(view.width / PIXEL))
    const bh = Math.max(1, Math.round(view.height / PIXEL))
    buffer ??= document.createElement('canvas')
    if (buffer.width !== bw || buffer.height !== bh) {
      buffer.width = bw
      buffer.height = bh
    }
    const b = buffer.getContext('2d')
    if (!b)
      return
    b.imageSmoothingEnabled = false

    const q = bw / AREA_W
    const u = (units: number) => units * q
    const base = spriteState(world.clock)
    const pulse = world.pulse / PULSE_MS
    const { ball } = world
    const vpX = MOUTH_X - ball.x * MOUTH_HALF * VP_DRIFT
    const vpY = MOUTH_Y - ball.y * MOUTH_HALF * VP_DRIFT
    const squareAt = (z: number) => {
      const f = 1 / (1 + z * DEPTH_K)
      return { cx: vpX + (MOUTH_X - vpX) * f, cy: vpY + (MOUTH_Y - vpY) * f, half: MOUTH_HALF * f }
    }
    const box = (sq: { cx: number; cy: number; half: number }) =>
      [u(sq.cx - sq.half), u(sq.cy - sq.half), u(sq.half * 2), u(sq.half * 2)] as const

    b.fillStyle = '#000'
    b.fillRect(0, 0, bw, bh)

    for (const s of STARS) {
      const twinkle = 0.55 + 0.45 * Math.sin(world.clock / 700 + s.x)
      sprites.star(b, u(s.x - ball.x * STAR_PARALLAX), u(s.y - ball.y * STAR_PARALLAX), 1, 1, { ...base, variant: s.brightness, alpha: twinkle })
    }

    // Four walls receding to the vanishing point; they flare on a clean pass.
    const near = squareAt(0), far = squareAt(TUNNEL_FAR)
    const wall = Math.round(110 + 145 * pulse)
    b.strokeStyle = `rgb(${wall}, ${wall}, ${wall})`
    b.lineWidth = 1
    b.beginPath()
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      b.moveTo(Math.round(u(near.cx + sx * near.half)) + 0.5, Math.round(u(near.cy + sy * near.half)) + 0.5)
      b.lineTo(Math.round(u(far.cx + sx * far.half)) + 0.5, Math.round(u(far.cy + sy * far.half)) + 0.5)
    }
    b.stroke()

    // Rings scroll toward the camera with the distance travelled.
    const offset = world.travel % RING_GAP
    for (let k = 1; k * RING_GAP - offset <= TUNNEL_FAR; k++) {
      const z = k * RING_GAP - offset
      if (z > 0.02)
        sprites.ring(b, ...box(squareAt(z)), { ...base, alpha: 0.6 * (1 - z / TUNNEL_FAR), glow: pulse })
    }
    sprites.frame(b, ...box(near), { ...base, glow: pulse })

    // Gates, far to near: solid tiles fade in as they approach.
    for (let g = world.gates.length - 1; g >= 0; g--) {
      const gate = world.gates[g]
      const sq = squareAt(gate.depth)
      const alpha = 0.35 + 0.65 * (1 - Math.min(1, gate.depth))
      const size = (sq.half * 2) / GRID
      gate.solid.forEach((solid, i) => {
        if (solid)
          sprites.tile(b, u(sq.cx - sq.half + (i % GRID) * size), u(sq.cy - sq.half + Math.floor(i / GRID) * size), u(size), u(size), { ...base, alpha })
      })
      sprites.gateOutline(b, ...box(sq), { ...base, alpha })
    }

    for (const bit of world.fragments) {
      const x = MOUTH_X + bit.x * MOUTH_HALF, y = MOUTH_Y + bit.y * MOUTH_HALF
      sprites.fragment(b, u(x), u(y), FRAGMENT_PX, FRAGMENT_PX, { ...base, alpha: 1 - bit.age / FRAGMENT_MS })
    }

    const boosting = isBoosting(world)
    const radius = BALL_RADIUS * (boosting ? BOOST_RADIUS : 1)
    const bx = MOUTH_X + ball.x * MOUTH_HALF, by = MOUTH_Y + ball.y * MOUTH_HALF
    const blink = world.flash > 0 && Math.floor(world.flash / FLASH_BLINK_MS) % 2 === 0 ? 1 : 0
    sprites.ball(b, u(bx - radius), u(by - radius), u(radius * 2), u(radius * 2), { ...base, variant: blink })

    // Overlays: multiplier top-left, shields top-right, boost bottom-left, stage banner centred.
    sprites.multiplier(b, u(8), u(8), u(40), u(13), { ...base, count: world.mult10, glow: pulse })
    const slots = Math.max(START_SHIELDS, world.shields)
    for (let i = 0; i < slots; i++)
      sprites.pip(b, u(AREA_W - 10 - (slots - i) * (PIP + 5)), u(10), u(PIP), u(PIP + 3), { ...base, count: i < world.shields ? 1 : 0 })
    const { x, y, r } = BOOST_BUTTON
    sprites.boostButton(b, u(x - r), u(y - r), u(r * 2), u(r * 2), { ...base, glow: boosting ? 1 : 0 })
    sprites.boostBar(b, u(BOOST_BAR.x), u(BOOST_BAR.y), u(BOOST_BAR.w), u(BOOST_BAR.h), { ...base, count: Math.round(world.boostEnergy * 100), glow: boosting ? 1 : 0 })
    if (world.banner > 0)
      sprites.banner(b, u(20), u(MOUTH_Y - 18), u(AREA_W - 40), u(36), { ...base, count: world.bannerStage, alpha: Math.min(1, world.banner / 150) })

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(buffer, 0, 0, view.width, view.height)
  }
}

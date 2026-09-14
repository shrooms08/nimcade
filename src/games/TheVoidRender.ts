import { spriteState } from './shared/sprites'
import type { BoardView } from './shared/useCanvasBoard'
import { sprites } from './TheVoidSprites'
import {
  AREA_H, AREA_W, BALL_RADIUS, BANNER_MS, BOOST_BAR, BOOST_BUTTON, BOOST_RADIUS, FRAGMENT_MS, GRID,
  isBoosting, MOUTH_HALF, MOUTH_X, MOUTH_Y, PULSE_MS, START_SHIELDS,
} from './TheVoidWorld'
import type { World } from './TheVoidWorld'

/** One-point perspective: a square at depth z is 1 / (1 + z * DEPTH_K) the size of the mouth. */
const DEPTH_K = 7
/** How deep the wall lines and rings reach. */
const TUNNEL_FAR = 4
const RING_GAP = 0.25
/** The vanishing point shifts against the ball by this share of the mouth size, for parallax. */
const VP_DRIFT = 0.12
const STAR_PARALLAX = 6
const WALL_ALPHA = 0.35
const RING_ALPHA = 0.2
const RING_PASS_ALPHA = 0.6
/** Rings brighten on a clean pass and fade back over this long. */
const RING_PASS_MS = 300
const TRAIL_COPIES = 4
/** Frames between trail copies. */
const TRAIL_SPACING = 3
/** Opacity of the newest trail copy; each older copy fades a step further. */
const TRAIL_ALPHA = 0.55
/** Each trail copy sits this much deeper, so the trail also streams toward the vanishing point. */
const TRAIL_DEPTH = 0.03
const BANNER_FADE_IN_MS = 120
const BANNER_FADE_OUT_MS = 220
const FLASH_BLINK_MS = 60
const PIP = 10
const SHARD = 6
const STARS = Array.from({ length: 40 }, (_, i) => ({
  x: (((i * 7919) % 997) / 997) * AREA_W,
  y: (((i * 104729) % 991) / 991) * AREA_H,
  size: 0.6 + ((i * 13) % 9) / 10,
  brightness: 0.3 + ((i * 29) % 55) / 100,
  twinkles: i % 3 === 0,
}))

/** Creates a renderer that remembers pass timing and the boost trail between frames. */
export function createRenderer() {
  let lastClock = -1
  let lastPasses = 0
  let passAt = Number.NEGATIVE_INFINITY
  const history: [number, number][] = []

  return function drawTheVoid(ctx: CanvasRenderingContext2D, view: BoardView, world: World) {
    if (world.clock < lastClock) { // a fresh round
      lastPasses = world.passes
      passAt = Number.NEGATIVE_INFINITY
      history.length = 0
    }
    if (world.passes > lastPasses)
      passAt = world.clock
    lastPasses = world.passes
    const advanced = world.clock !== lastClock
    lastClock = world.clock

    ctx.imageSmoothingEnabled = true
    const k = view.width / AREA_W
    const u = (units: number) => units * k
    const base = spriteState(world.clock)
    const { ball } = world
    const vpX = MOUTH_X - ball.x * MOUTH_HALF * VP_DRIFT
    const vpY = MOUTH_Y - ball.y * MOUTH_HALF * VP_DRIFT
    const squareAt = (z: number) => {
      const f = 1 / (1 + z * DEPTH_K)
      return { cx: vpX + (MOUTH_X - vpX) * f, cy: vpY + (MOUTH_Y - vpY) * f, half: MOUTH_HALF * f }
    }
    const box = (sq: { cx: number; cy: number; half: number }) =>
      [u(sq.cx - sq.half), u(sq.cy - sq.half), u(sq.half * 2), u(sq.half * 2)] as const

    sprites.background(ctx, 0, 0, view.width, view.height, base)
    STARS.forEach((s, i) => {
      const shimmer = s.twinkles ? Math.max(0, Math.sin(world.clock / 520 + i * 1.7)) : 0
      sprites.star(ctx, u(s.x - ball.x * STAR_PARALLAX), u(s.y - ball.y * STAR_PARALLAX), s.size, s.size, {
        ...base, alpha: s.brightness * (0.7 + 0.3 * shimmer), glow: shimmer > 0.6 ? shimmer : 0,
      })
    })

    // Rings at 20%, brightening to 60% on a clean pass and fading back over 300ms.
    const pass = Math.max(0, 1 - (world.clock - passAt) / RING_PASS_MS)
    const ringAlpha = RING_ALPHA + (RING_PASS_ALPHA - RING_ALPHA) * pass
    const offset = world.travel % RING_GAP
    for (let n = 1; n * RING_GAP - offset <= TUNNEL_FAR; n++) {
      const z = n * RING_GAP - offset
      if (z > 0.02)
        sprites.ring(ctx, ...box(squareAt(z)), { ...base, alpha: ringAlpha * (1 - z / TUNNEL_FAR) })
    }

    // Four thin walls receding to the vanishing point.
    const near = squareAt(0), far = squareAt(TUNNEL_FAR)
    ctx.lineWidth = 1
    ctx.strokeStyle = `rgba(222, 224, 230, ${WALL_ALPHA})`
    ctx.beginPath()
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(u(near.cx + sx * near.half), u(near.cy + sy * near.half))
      ctx.lineTo(u(far.cx + sx * far.half), u(far.cy + sy * far.half))
    }
    ctx.stroke()
    sprites.frame(ctx, ...box(near), { ...base, alpha: WALL_ALPHA + 0.2 * (world.pulse / PULSE_MS) })

    // Gates, far to near; distant ones are dimmer.
    for (let g = world.gates.length - 1; g >= 0; g--) {
      const gate = world.gates[g]
      const sq = squareAt(gate.depth)
      const alpha = 0.2 + 0.8 * (1 - Math.min(1, gate.depth))
      const size = (sq.half * 2) / GRID
      gate.solid.forEach((solid, i) => {
        if (solid)
          sprites.tile(ctx, u(sq.cx - sq.half + (i % GRID) * size), u(sq.cy - sq.half + Math.floor(i / GRID) * size), u(size), u(size), { ...base, alpha })
      })
      sprites.gateOutline(ctx, ...box(sq), { ...base, alpha })
    }

    for (const bit of world.fragments) {
      const degrees = (Math.atan2(bit.vy, bit.vx) * 180) / Math.PI + bit.age * 0.6
      sprites.fragment(ctx, u(MOUTH_X + bit.x * MOUTH_HALF - SHARD / 2), u(MOUTH_Y + bit.y * MOUTH_HALF - SHARD / 2), u(SHARD), u(SHARD), {
        ...base, alpha: 1 - bit.age / FRAGMENT_MS, variant: degrees,
      })
    }

    // Ball, with a short trail of fading copies while boosting.
    const boosting = isBoosting(world)
    const bx = MOUTH_X + ball.x * MOUTH_HALF, by = MOUTH_Y + ball.y * MOUTH_HALF
    if (advanced) {
      history.push([bx, by])
      if (history.length > TRAIL_COPIES * TRAIL_SPACING + 1)
        history.shift()
    }
    const radius = BALL_RADIUS * (boosting ? BOOST_RADIUS : 1)
    const blink = world.flash > 0 && Math.floor(world.flash / FLASH_BLINK_MS) % 2 === 0 ? 1 : 0
    const ballBox = [u(bx - radius), u(by - radius), u(radius * 2), u(radius * 2)] as const
    // Halo first, then the trail on top of the glow, then the core over both.
    sprites.ball(ctx, ...ballBox, { ...base, count: 1, glow: boosting ? 1 : 0 })
    if (boosting) {
      for (let c = TRAIL_COPIES; c >= 1; c--) {
        const sample = history[history.length - 1 - c * TRAIL_SPACING]
        if (!sample)
          continue
        const f = 1 / (1 + c * TRAIL_DEPTH * DEPTH_K)
        const tx = vpX + (sample[0] - vpX) * f, ty = vpY + (sample[1] - vpY) * f
        const r = radius * f
        sprites.trail(ctx, u(tx - r), u(ty - r), u(r * 2), u(r * 2), { ...base, alpha: TRAIL_ALPHA * (1 - (c - 1) / TRAIL_COPIES) })
      }
    }
    sprites.ball(ctx, ...ballBox, { ...base, count: 2, variant: blink, glow: boosting ? 1 : 0 })

    // Overlays: multiplier top-left, shields top-right, boost bottom-left, stage banner centred.
    sprites.multiplier(ctx, u(9), u(9), u(40), u(13), { ...base, count: world.mult10, glow: world.pulse / PULSE_MS })
    const slots = Math.max(START_SHIELDS, world.shields)
    for (let i = 0; i < slots; i++)
      sprites.pip(ctx, u(AREA_W - 10 - (slots - i) * (PIP + 5)), u(10), u(PIP), u(PIP + 3), { ...base, count: i < world.shields ? 1 : 0 })
    const { x, y, r } = BOOST_BUTTON
    sprites.boostButton(ctx, u(x - r), u(y - r), u(r * 2), u(r * 2), { ...base, glow: boosting ? 1 : 0 })
    sprites.boostBar(ctx, u(BOOST_BAR.x), u(BOOST_BAR.y), u(BOOST_BAR.w), u(BOOST_BAR.h), {
      ...base, count: Math.round(world.boostEnergy * 100), glow: boosting ? 1 : 0,
    })
    if (world.banner > 0) {
      const alpha = Math.min(1, (BANNER_MS - world.banner) / BANNER_FADE_IN_MS, world.banner / BANNER_FADE_OUT_MS)
      sprites.banner(ctx, 0, u(MOUTH_Y - 22), view.width, u(44), { ...base, count: world.bannerStage, alpha })
    }
  }
}

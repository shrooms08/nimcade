import { SHAKE_MS } from './shared/effects'

/** Play area in game units; the canvas keeps this 3:4 shape. */
export const AREA_W = 300
export const AREA_H = 400
/** The tunnel mouth (depth 0): centre and half-size in units. Tunnel-plane x,y run -1..1 across it. */
export const MOUTH_X = 150
export const MOUTH_Y = 172
export const MOUTH_HALF = 128
export const BALL_RADIUS = 14
/** Boost button and bar, bottom-left, outside the tunnel. */
export const BOOST_BUTTON = { x: 48, y: 350, r: 30 }
export const BOOST_BAR = { x: 92, y: 346, w: 186, h: 8 }

export const GRID = 5
const TILE = 2 / GRID
/** Depth per second at stage 1: a gate takes ~1.8s from spawn (depth 1) to the camera (depth 0). */
export const BASE_APPROACH = 0.55
export const STAGE_SPEEDUP = 1.08
export const MAX_SPEED_FACTOR = 2.5
/** Depth between consecutive gates. */
export const GATE_GAP = 0.5
export const GATES_PER_STAGE = 10
export const GATE_POINTS = 10
/** The pass multiplier grows by 0.1 per clean gate and stops at x5.0 (values in tenths). */
export const MAX_MULT10 = 50
export const STAGE_BONUS = 100
export const START_SHIELDS = 3
export const MAX_SHIELDS = 5
export const BOOST_SPEED = 1.8
export const BOOST_POINTS = 2
export const BOOST_RADIUS = 1.4
export const BOOST_DRAIN_SECONDS = 3
export const BOOST_REFILL_SECONDS = 6
/** The ball eases toward the finger at this rate, never faster than BALL_MAX_SPEED plane units/s. */
export const BALL_EASE = 14
export const BALL_MAX_SPEED = 3.5
/** Fraction of the worst-case travel budget a new gate's opening may ask for. */
const REACH_MARGIN = 0.8
export const PULSE_MS = 220
export const FLASH_MS = 450
export const BANNER_MS = 800
export const FRAGMENTS = 8
export const FRAGMENT_MS = 600
/** Time between the fatal hit and the end panel, so the shatter reads. */
export const CRASH_HOLD_MS = 450
/** During the 3-2-1 pre-roll the tunnel drifts at this fraction of stage-1 speed. */
export const PRE_ROLL_DRIFT = 0.25

export interface Gate { depth: number; solid: boolean[] }
export interface Fragment { x: number; y: number; vx: number; vy: number; age: number }

export interface World {
  /** Endless: a round only ends on a hit with no shields left. */
  status: 'ready' | 'countdown' | 'playing' | 'crashed'
  ball: { x: number; y: number }
  target: { x: number; y: number }
  /** Nearest first. */
  gates: Gate[]
  /** Open tiles of the most recently spawned gate, for the reachability guarantee. */
  lastOpen: number[]
  fragments: Fragment[]
  score: number
  /** Multiplier in tenths: 10 = x1.0. */
  mult10: number
  shields: number
  stage: number
  gateInStage: number
  boostHeld: boolean
  /** 0..1: drains over 3s of boosting, refills over 6s released. */
  boostEnergy: number
  /** Total depth travelled; scrolls the tunnel rings. */
  travel: number
  passes: number
  hits: number
  pulse: number
  flash: number
  shake: number
  banner: number
  bannerStage: number
  crashHold: number
  clock: number
}

export const speedFactor = (stage: number) => Math.min(MAX_SPEED_FACTOR, STAGE_SPEEDUP ** (stage - 1))
export const isBoosting = (world: World) => world.status === 'playing' && world.boostHeld && world.boostEnergy > 0
export const approachSpeed = (world: World) => BASE_APPROACH * speedFactor(world.stage) * (isBoosting(world) ? BOOST_SPEED : 1)
export const ballRadius = (world: World) => (BALL_RADIUS / MOUTH_HALF) * (isBoosting(world) ? BOOST_RADIUS : 1)
const BALL_LIMIT = 1 - BALL_RADIUS / MOUTH_HALF

export const tileCenter = (i: number): [number, number] => [-1 + TILE * ((i % GRID) + 0.5), -1 + TILE * (Math.floor(i / GRID) + 0.5)]
export const unitsToPlane = (ux: number, uy: number): [number, number] => [(ux - MOUTH_X) / MOUTH_HALF, (uy - MOUTH_Y) / MOUTH_HALF]
export const inBoostButton = (ux: number, uy: number) => Math.hypot(ux - BOOST_BUTTON.x, uy - BOOST_BUTTON.y) <= BOOST_BUTTON.r * 1.15

// ---- Gate templates (true = solid) ----

type Rng = () => number
const blank = () => new Array<boolean>(GRID * GRID).fill(false)
const pick = (n: number, rng: Rng) => Math.floor(rng() * n)
const build = (test: (r: number, c: number) => boolean) => blank().map((_, i) => test(Math.floor(i / GRID), i % GRID))

export const TEMPLATES: Record<string, (rng: Rng) => boolean[]> = {
  singleBar: (rng) => { const row = pick(GRID, rng); return build(r => r === row) },
  doubleBar: (rng) => { const a = pick(GRID, rng); const b = (a + 1 + pick(GRID - 1, rng)) % GRID; return build(r => r === a || r === b) },
  cross: () => build((r, c) => r === 2 || c === 2),
  corner: () => build((r, c) => r === 0 || c === 0),
  ring: () => build((r, c) => r === 0 || c === 0 || r === GRID - 1 || c === GRID - 1),
  diagonal: () => build((r, c) => r === c || r === c + 1),
  scatter: (rng) => {
    const grid = blank()
    for (let placed = 0; placed < 10;) {
      const i = pick(GRID * GRID, rng)
      if (!grid[i]) { grid[i] = true; placed++ }
    }
    const [r0, c0] = [pick(GRID - 1, rng), pick(GRID - 1, rng)] // guaranteed 2x2 open pocket
    for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) grid[(r0 + dr) * GRID + c0 + dc] = false
    return grid
  },
}

function transform(grid: boolean[], turns: number, mirror: boolean): boolean[] {
  let out = grid
  for (let t = 0; t < turns; t++) {
    const next = blank()
    out.forEach((s, i) => { next[(i % GRID) * GRID + (GRID - 1 - Math.floor(i / GRID))] = s })
    out = next
  }
  return mirror ? out.map((_, i) => out[Math.floor(i / GRID) * GRID + (GRID - 1 - (i % GRID))]) : out
}

export const openTiles = (grid: boolean[]) => grid.flatMap((s, i) => (s ? [] : [i]))

export function reachable(from: number[], to: number[], maxDist: number) {
  return to.some(t => from.some((f) => {
    const [tx, ty] = tileCenter(t), [fx, fy] = tileCenter(f)
    return Math.hypot(tx - fx, ty - fy) <= maxDist + 1e-9
  }))
}

/** Worst-case distance the ball can cover between two gates at this stage, with boost held. */
export const maxReach = (stage: number) =>
  ((BALL_MAX_SPEED * GATE_GAP) / (BASE_APPROACH * speedFactor(stage) * BOOST_SPEED)) * REACH_MARGIN

/** A random template, rotated and mirrored, whose opening is reachable from `prevOpen`. */
export function generateGate(prevOpen: number[], maxDist: number, rng: Rng = Math.random): boolean[] {
  const names = Object.keys(TEMPLATES)
  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = transform(TEMPLATES[names[pick(names.length, rng)]](rng), pick(4, rng), rng() < 0.5)
    const open = openTiles(grid)
    if (open.length > 0 && reachable(prevOpen, open, maxDist))
      return grid
  }
  const grid = TEMPLATES.singleBar(rng)
  grid[prevOpen[0]] = false // fallback: keep the previous opening open
  return grid
}

export function collides(solid: boolean[], x: number, y: number, r: number) {
  return solid.some((isSolid, i) => {
    if (!isSolid)
      return false
    const left = -1 + TILE * (i % GRID), top = -1 + TILE * Math.floor(i / GRID)
    const nx = Math.min(Math.max(x, left), left + TILE), ny = Math.min(Math.max(y, top), top + TILE)
    return (x - nx) ** 2 + (y - ny) ** 2 < r * r
  })
}

export function createWorld(): World {
  return {
    status: 'ready', ball: { x: 0, y: 0 }, target: { x: 0, y: 0 }, gates: [], lastOpen: [12], fragments: [],
    score: 0, mult10: 10, shields: START_SHIELDS, stage: 1, gateInStage: 0, boostHeld: false, boostEnergy: 1,
    travel: 0, passes: 0, hits: 0, pulse: 0, flash: 0, shake: 0, banner: 0, bannerStage: 0, crashHold: 0, clock: 0,
  }
}

export function setTarget(world: World, x: number, y: number) {
  world.target.x = Math.min(BALL_LIMIT, Math.max(-BALL_LIMIT, x))
  world.target.y = Math.min(BALL_LIMIT, Math.max(-BALL_LIMIT, y))
}

export const setBoost = (world: World, held: boolean) => { world.boostHeld = held }

function spawnGate(world: World, depth: number) {
  const solid = generateGate(world.lastOpen, maxReach(world.stage))
  world.gates.push({ depth, solid })
  world.lastOpen = openTiles(solid)
}

function shatter(world: World, gate: Gate) {
  const solids = gate.solid.flatMap((s, i) => (s ? [i] : []))
  for (let n = 0; n < FRAGMENTS; n++) {
    const [x, y] = tileCenter(solids[n % solids.length])
    const angle = Math.atan2(y, x) + (Math.random() - 0.5) * 1.2
    const speed = 0.9 + Math.random() * 0.9
    world.fragments.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0 })
  }
}

function resolveGate(world: World, gate: Gate, boosting: boolean) {
  if (collides(gate.solid, world.ball.x, world.ball.y, ballRadius(world))) {
    world.hits += 1
    world.flash = FLASH_MS
    world.shake = SHAKE_MS
    world.mult10 = 10
    shatter(world, gate)
    if (world.shields === 0) {
      world.status = 'crashed'
      world.crashHold = CRASH_HOLD_MS
      return
    }
    world.shields -= 1
  }
  else {
    world.score += Math.round(GATE_POINTS * (world.mult10 / 10) * (boosting ? BOOST_POINTS : 1))
    world.mult10 = Math.min(MAX_MULT10, world.mult10 + 1)
    world.passes += 1
    world.pulse = PULSE_MS
  }
  world.gateInStage += 1
  if (world.gateInStage >= GATES_PER_STAGE) {
    world.score += STAGE_BONUS * world.stage
    world.shields = Math.min(MAX_SHIELDS, world.shields + 1)
    world.banner = BANNER_MS
    world.bannerStage = world.stage
    world.stage += 1
    world.gateInStage = 0
  }
}

/** The ball eases toward the finger, never faster than BALL_MAX_SPEED. */
function moveBall(world: World, dt: number) {
  let mx = (world.target.x - world.ball.x) * Math.min(1, dt * BALL_EASE)
  let my = (world.target.y - world.ball.y) * Math.min(1, dt * BALL_EASE)
  const moved = Math.hypot(mx, my), cap = BALL_MAX_SPEED * dt
  if (moved > cap) { mx *= cap / moved; my *= cap / moved }
  world.ball.x += mx
  world.ball.y += my
}

export function step(world: World, dt: number) {
  const ms = dt * 1000
  world.clock += ms
  world.pulse = Math.max(0, world.pulse - ms)
  world.flash = Math.max(0, world.flash - ms)
  world.banner = Math.max(0, world.banner - ms)
  world.shake = Math.max(0, world.shake - ms)
  world.fragments = world.fragments
    .map(f => ({ ...f, x: f.x + f.vx * dt, y: f.y + f.vy * dt, age: f.age + ms }))
    .filter(f => f.age < FRAGMENT_MS)
  if (world.status === 'crashed') {
    world.crashHold = Math.max(0, world.crashHold - ms)
    return
  }
  if (world.status === 'countdown') {
    // Pre-roll: the ball can be positioned and the tunnel drifts, but no gates spawn.
    moveBall(world, dt)
    world.travel += BASE_APPROACH * PRE_ROLL_DRIFT * dt
    return
  }
  if (world.status !== 'playing')
    return

  const boosting = isBoosting(world)
  const speed = approachSpeed(world)
  if (boosting)
    world.boostEnergy = Math.max(0, world.boostEnergy - dt / BOOST_DRAIN_SECONDS)
  else if (!world.boostHeld)
    world.boostEnergy = Math.min(1, world.boostEnergy + dt / BOOST_REFILL_SECONDS)

  moveBall(world, dt)

  world.travel += speed * dt
  if (world.gates.length === 0)
    spawnGate(world, 1)
  for (const gate of world.gates) gate.depth -= speed * dt
  const last = world.gates[world.gates.length - 1]
  if (last.depth <= 1 - GATE_GAP)
    spawnGate(world, last.depth + GATE_GAP)
  while (world.gates.length > 0 && world.gates[0].depth <= 0) {
    resolveGate(world, world.gates.shift()!, boosting)
    if (world.status !== 'playing')
      return
  }
}

/** The round ends once the fatal hit's shatter has had time to show. */
export const crashDone = (world: World) => world.status === 'crashed' && world.crashHold === 0

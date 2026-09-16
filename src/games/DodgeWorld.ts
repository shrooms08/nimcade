import { agePops, SHAKE_MS } from './shared/effects'
import type { Pop } from './shared/effects'

/** Dodge's simulation: no DOM, no React. The component draws whatever this leaves in the world. */

/** Game units: the road is always WORLD_W units wide, split into two lanes. */
export const WORLD_W = 200
/** Share of the canvas width the road takes, centred; the rest is dark margin. */
export const ROAD_SHARE = 0.6
export const LANE_X = [50, 150]
export const PLAYER_SIZE = 56
/** Player centre, measured up from the bottom of the board. */
export const PLAYER_FROM_BOTTOM = 80
export const OBSTACLE_W = 76
export const OBSTACLE_H = 30
export const COIN_SIZE = 56
/** How close (in units) the player and an object must be to touch. */
const HIT_X = 50
const HIT_Y = 24
/** Speed factor keyframes [seconds, factor], linear between them, holding after the last. */
const RAMP: [number, number][] = [[0, 1], [8, 2], [25, 3], [50, 3.5], [90, 4]]
const MAX_FACTOR = RAMP[RAMP.length - 1][1]
/** Row spacing tightens linearly with speed, from ROW_GAP_SLOW at 1x to ROW_GAP_FAST at top speed. */
const ROW_GAP_SLOW = 150
const ROW_GAP_FAST = 115
/** Shortest flip window a round asks for, at top speed. */
const MIN_FLIP_WINDOW_MS = 180
/**
 * Road speed at 1x (units/s). Flip window = (gap - 2 * HIT_Y) / speed. A 600ms window at 1x needs ~170,
 * which leaves ~99ms at 4x, so the 4x floor sets it (~93): ~1096ms at 1x, ~485ms 2x, ~282ms 3x, 180ms 4x.
 */
const BASE_SPEED = (ROW_GAP_FAST - 2 * HIT_Y) / ((MAX_FACTOR * MIN_FLIP_WINDOW_MS) / 1000)
const FIRST_ROW_Y = -60
/** When a round starts, rows are already laid out from this far above the critter. */
const FIRST_ROW_LEAD = 160
const FLIP_SECONDS = 0.1
export const DASH_GAP = 60

/** Rows repeat barrier, barrier, rest: a rest row has coins in both lanes and no barrier. */
const ROW_CYCLE = 3
const BARRIER_ROWS_PER_CYCLE = 2
/** At most this many barrier rows in a row may block the same lane (rest rows don't reset it). */
const MAX_SAME_LANE = 3

interface Thing { lane: 0 | 1; y: number; kind: 'barrier' | 'coin' }

export interface World {
  /** Endless: a round only ends on a crash. */
  status: 'ready' | 'playing' | 'crashed'
  lane: 0 | 1
  /** 0 -> 1 through the current flip; 1 when settled. */
  flip: number
  things: Thing[]
  rowsSpawned: number
  /** Lane of the last barrier and how many barrier rows in a row have used it. */
  streakLane: 0 | 1
  streak: number
  untilRow: number
  distance: number
  score: number
  /** Seconds of play, drives the speed ramp. */
  elapsed: number
  /** Rows ahead are laid out on the first playing frame, once the board height is known. */
  seeded: boolean
  pops: Pop[]
  shake: number
  clock: number
}

export function createWorld(): World {
  return {
    status: 'ready', lane: 0, flip: 1, things: [], rowsSpawned: 0, streakLane: 0, streak: 0, untilRow: 0, distance: 0, score: 0,
    elapsed: 0, seeded: false, pops: [], shake: 0, clock: 0,
  }
}

export function speedFactor(elapsed: number): number {
  for (let i = 1; i < RAMP.length; i++) {
    const [[t0, f0], [t1, f1]] = [RAMP[i - 1], RAMP[i]]
    if (elapsed <= t1)
      return f0 + (f1 - f0) * ((elapsed - t0) / (t1 - t0))
  }
  return MAX_FACTOR
}

const rowGap = (factor: number) =>
  ROW_GAP_SLOW - (ROW_GAP_SLOW - ROW_GAP_FAST) * ((factor - 1) / (MAX_FACTOR - 1))

/** Time to flip between back-to-back barrier rows in opposite lanes, at a speed factor. */
export const flipWindowMs = (factor: number) => Math.round(((rowGap(factor) - 2 * HIT_Y) / (BASE_SPEED * factor)) * 1000)

/** Game units visible top to bottom for a canvas of this size. */
export const unitsTall = (width: number, height: number) => (width ? height / ((width * ROAD_SHARE) / WORLD_W) : 600)

export function playerX(world: World): number {
  const from = LANE_X[1 - world.lane]
  const to = LANE_X[world.lane]
  return from + (to - from) * world.flip
}

function spawnRow(world: World, y: number) {
  const slot = world.rowsSpawned++ % ROW_CYCLE
  if (slot >= BARRIER_ROWS_PER_CYCLE) {
    world.things.push({ lane: 0, y, kind: 'coin' }, { lane: 1, y, kind: 'coin' })
    return
  }
  let blocked: 0 | 1 = Math.random() < 0.5 ? 0 : 1
  if (blocked === world.streakLane && world.streak >= MAX_SAME_LANE)
    blocked = blocked === 0 ? 1 : 0
  world.streak = blocked === world.streakLane ? world.streak + 1 : 1
  world.streakLane = blocked
  world.things.push({ lane: blocked, y, kind: 'barrier' }, { lane: blocked === 0 ? 1 : 0, y, kind: 'coin' })
}

export function step(world: World, dt: number, viewH: number) {
  const ms = dt * 1000
  world.clock += ms
  world.pops = agePops(world.pops, ms)
  if (world.status === 'crashed') {
    world.shake = Math.max(0, world.shake - ms)
    return
  }
  if (world.status !== 'playing')
    return

  if (!world.seeded) {
    world.seeded = true
    const gap = rowGap(1)
    let y = viewH - PLAYER_FROM_BOTTOM - FIRST_ROW_LEAD
    for (; y >= FIRST_ROW_Y; y -= gap) spawnRow(world, y)
    world.untilRow = FIRST_ROW_Y - y // distance until the next row reaches the spawn line
  }

  world.elapsed += dt
  world.flip = Math.min(1, world.flip + dt / FLIP_SECONDS)
  const factor = speedFactor(world.elapsed)
  const travel = BASE_SPEED * factor * dt
  world.distance += travel
  for (const thing of world.things)
    thing.y += travel

  world.untilRow -= travel
  while (world.untilRow <= 0) {
    spawnRow(world, FIRST_ROW_Y + world.untilRow)
    world.untilRow += rowGap(factor)
  }

  const px = playerX(world)
  const py = viewH - PLAYER_FROM_BOTTOM
  for (const thing of world.things) {
    const touching = Math.abs(LANE_X[thing.lane] - px) < HIT_X && Math.abs(thing.y - py) < HIT_Y
    if (!touching)
      continue
    if (thing.kind === 'barrier') {
      world.status = 'crashed'
      world.shake = SHAKE_MS
      return
    }
    world.score += 1
    world.pops.push({ x: LANE_X[thing.lane], y: thing.y, age: 0 })
    thing.y = Number.POSITIVE_INFINITY // collected: drop it on the filter below
  }
  world.things = world.things.filter(thing => thing.y < viewH + OBSTACLE_H * 2)
}

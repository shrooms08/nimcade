import { agePops, SHAKE_MS } from './shared/effects'
import type { Pop } from './shared/effects'

/**
 * Game units: the canvas is always WORLD_W units wide (1 unit ≈ 1 CSS px on a
 * phone). World y grows upward from the top of the street.
 */
export const WORLD_W = 300
export const FLOOR_H = 22
/** Width of the foundation slab, and the widest a floor can be. */
export const BASE_W = 150
/** The street below the foundation slab. */
export const STREET_H = 36
export const SLIDE_SPEED = 160
/** Horizontal speed compounds by 3% per floor placed, capped at 2x SLIDE_SPEED. */
export const SLIDE_SPEED_GROWTH = 1.03
export const SLIDE_SPEED_MAX_FACTOR = 2

/** Horizontal speed, in units per second, after `floors` floors. */
export const slideSpeed = (floors: number) =>
  SLIDE_SPEED * Math.min(SLIDE_SPEED_MAX_FACTOR, SLIDE_SPEED_GROWTH ** floors)
/** How far above the tower the crane carries a new floor. */
export const HOVER_GAP = 100
export const LOWER_SPEED = 150
export const DROP_SPEED = 900
export const GRAVITY = 1400
export const PERFECT_PX = 3
export const PERFECT_RESTORE_PX = 6
/** How long a perfect floor's windows glow. */
export const GLOW_MS = 450
export const LABEL_MS = 700
/** From the third perfect in a row, each perfect adds STREAK_BONUS and a confetti burst. */
export const STREAK_FOR_BONUS = 3
export const STREAK_BONUS = 5
export const CONFETTI_COUNT = 12
export const CONFETTI_MS = 800
/** A missed floor tumbles for this long before the round ends. */
export const TUMBLE_MS = 600
const TUMBLE_DROP_SPEED = 250
const TUMBLE_DRIFT = 90
const TUMBLE_SPIN = 0.9

/** Windows on a floor of this width: 2 to 6, so they recompute whenever a floor is sliced. */
export const windowsFor = (width: number) => Math.max(2, Math.min(6, Math.round(width / 25)))

export interface Slab { x: number; w: number }
export interface Debris extends Slab { bottom: number; vy: number; variant: number }
/** The floor hanging from the crane. */
export interface Load extends Slab {
  bottom: number
  dirX: 1 | -1
  falling: boolean
  /** Set when a hold starts on this floor, so a leftover release can't drop the next one. */
  pressed: boolean
  /** World y of the hook when the floor was released; the cable stops there. */
  hookTop: number | null
}
export interface Confetti { x: number; y: number; vx: number; vy: number; age: number; variant: number }
export interface Label { x: number; y: number; age: number; bonus: number }
export interface Tumble extends Slab { bottom: number; vx: number; vy: number; angle: number; spin: number; age: number; variant: number }

export interface World {
  /** Endless: a round only ends on a complete miss. */
  status: 'ready' | 'playing' | 'missed'
  /** stack[0] is the foundation slab; floors sit on top of it. */
  stack: Slab[]
  load: Load
  debris: Debris[]
  holding: boolean
  /** Floors placed; the slab doesn't count. */
  floors: number
  /** Floors plus streak bonuses. */
  score: number
  perfectStreak: number
  camera: number
  pops: Pop[]
  /** Time left on the top floor's lit windows. */
  glow: number
  labels: Label[]
  confetti: Confetti[]
  tumble: Tumble | null
  shake: number
  clock: number
}

export const stackTop = (world: World) => world.stack.length * FLOOR_H

export function spawnLoad(world: World) {
  const { w } = world.stack[world.stack.length - 1]
  const fromLeft = world.stack.length % 2 === 0
  world.load = {
    x: fromLeft ? 0 : WORLD_W - w, w, bottom: stackTop(world) + HOVER_GAP,
    dirX: fromLeft ? 1 : -1, falling: false, pressed: false, hookTop: null,
  }
}

export function createWorld(): World {
  const world = {
    status: 'ready', stack: [{ x: (WORLD_W - BASE_W) / 2, w: BASE_W }], debris: [], holding: false,
    floors: 0, score: 0, perfectStreak: 0, camera: 0, pops: [], glow: 0, labels: [], confetti: [],
    tumble: null, shake: 0, clock: 0,
  } as Omit<World, 'load'> as World
  spawnLoad(world)
  return world
}

/** A hold starts: the crane lowers the floor while held. */
export function pressLoad(world: World) {
  world.holding = true
  if (!world.load.falling)
    world.load.pressed = true
}

/** A release drops the floor, but only if the hold started on this floor. */
export function releaseLoad(world: World) {
  world.holding = false
  const { load } = world
  if (world.status === 'playing' && load.pressed && !load.falling) {
    load.falling = true
    load.hookTop = load.bottom + FLOOR_H
  }
}

function burst(world: World, x: number, y: number) {
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const angle = Math.PI * (0.15 + 0.7 * Math.random())
    const speed = 120 + 140 * Math.random()
    world.confetti.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, variant: i })
  }
}

export function lock(world: World) {
  const top = world.stack[world.stack.length - 1]
  const { load } = world
  const bottom = stackTop(world)
  const left = Math.max(load.x, top.x)
  const right = Math.min(load.x + load.w, top.x + top.w)
  const variant = world.stack.length % 2

  if (right <= left) {
    const side = load.x + load.w / 2 < top.x + top.w / 2 ? -1 : 1
    world.tumble = { x: load.x, w: load.w, bottom, variant, vx: side * TUMBLE_DRIFT, vy: TUMBLE_DROP_SPEED, angle: 0, spin: side * TUMBLE_SPIN, age: 0 }
    world.status = 'missed'
    world.perfectStreak = 0
    world.shake = SHAKE_MS
    return
  }

  let slab: Slab
  if (Math.abs(load.x - top.x) <= PERFECT_PX) {
    const w = Math.min(BASE_W, top.w + PERFECT_RESTORE_PX)
    slab = { x: Math.min(Math.max(0, top.x - (w - top.w) / 2), WORLD_W - w), w }
    world.perfectStreak += 1
    const bonus = world.perfectStreak >= STREAK_FOR_BONUS ? STREAK_BONUS : 0
    world.score += bonus
    world.glow = GLOW_MS
    world.labels.push({ x: slab.x + slab.w / 2, y: bottom + FLOOR_H * 2.2, age: 0, bonus })
    if (bonus)
      burst(world, slab.x + slab.w / 2, bottom + FLOOR_H)
  }
  else {
    slab = { x: left, w: right - left }
    world.debris.push({ x: load.x < top.x ? load.x : right, w: load.w - slab.w, bottom, vy: 0, variant })
    world.perfectStreak = 0
  }
  world.stack.push(slab)
  world.floors += 1
  world.score += 1
  world.pops.push({ x: slab.x + slab.w / 2, y: bottom, age: 0 })
  spawnLoad(world)
}

export function step(world: World, dt: number, viewH: number) {
  const ms = dt * 1000
  world.clock += ms
  world.glow = Math.max(0, world.glow - ms)
  world.pops = agePops(world.pops, ms)
  world.labels = agePops(world.labels, ms, LABEL_MS)
  world.confetti = world.confetti
    .map(bit => ({ ...bit, age: bit.age + ms, x: bit.x + bit.vx * dt, y: bit.y + bit.vy * dt, vy: bit.vy - GRAVITY * 0.5 * dt }))
    .filter(bit => bit.age < CONFETTI_MS)
  for (const piece of world.debris) {
    piece.vy += GRAVITY * dt
    piece.bottom -= piece.vy * dt
  }
  world.debris = world.debris.filter(piece => piece.bottom > world.camera - viewH)
  const { tumble } = world
  if (tumble) {
    tumble.age += ms
    tumble.vy += GRAVITY * dt
    tumble.bottom -= tumble.vy * dt
    tumble.x += tumble.vx * dt
    tumble.angle += tumble.spin * dt
  }
  // Keep the crane's floor about a quarter of the way down the screen.
  const target = Math.max(0, stackTop(world) + HOVER_GAP + FLOOR_H + STREET_H - viewH * 0.75)
  world.camera += (target - world.camera) * Math.min(1, dt * 6)

  if (world.status === 'missed') {
    world.shake = Math.max(0, world.shake - ms)
    return
  }
  if (world.status !== 'playing')
    return

  const { load } = world
  if (load.falling) {
    load.bottom -= DROP_SPEED * dt
  }
  else {
    load.x += load.dirX * slideSpeed(world.floors) * dt
    if (load.x <= 0 || load.x >= WORLD_W - load.w) {
      load.x = Math.min(Math.max(0, load.x), WORLD_W - load.w)
      load.dirX = load.x <= 0 ? 1 : -1
    }
    if (world.holding && load.pressed)
      load.bottom -= LOWER_SPEED * dt
  }
  if (load.bottom <= stackTop(world))
    lock(world)
}

/** The round ends once a missed floor has finished tumbling. */
export const tumbleDone = (world: World) => world.status === 'missed' && (world.tumble?.age ?? 0) >= TUMBLE_MS

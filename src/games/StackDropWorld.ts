import { agePops, SHAKE_MS } from './shared/effects'
import type { Pop } from './shared/effects'

/** Game units: the canvas is always WORLD_W units wide; 1 unit ≈ 1 CSS px on a phone. */
export const WORLD_W = 300
export const BLOCK_H = 22
export const BASE_W = 150
export const GROUND_H = 36
export const SLIDE_SPEED = 160
/** Horizontal speed compounds by 3% per block placed, capped at 2x SLIDE_SPEED. */
export const SLIDE_SPEED_GROWTH = 1.03
export const SLIDE_SPEED_MAX_FACTOR = 2

/** Horizontal speed, in units per second, after `blocksPlaced` blocks. */
export const slideSpeed = (blocksPlaced: number) =>
  SLIDE_SPEED * Math.min(SLIDE_SPEED_MAX_FACTOR, SLIDE_SPEED_GROWTH ** blocksPlaced)
/** How far above the stack a new block hovers. */
export const HOVER_GAP = 100
export const LOWER_SPEED = 150
export const DROP_SPEED = 900
export const GRAVITY = 1400
export const PERFECT_PX = 3
export const PERFECT_RESTORE_PX = 6
export const PERFECT_MS = 220

export interface Slab { x: number; w: number }
export interface Debris extends Slab { bottom: number; vy: number; variant: number }
export interface Block extends Slab {
  bottom: number
  dirX: 1 | -1
  falling: boolean
  /** Set when a hold starts on this block, so a leftover release can't drop the next one. */
  pressed: boolean
}

export interface World {
  /** Endless: a round only ends on a complete miss. */
  status: 'ready' | 'playing' | 'missed'
  stack: Slab[]
  block: Block
  debris: Debris[]
  holding: boolean
  score: number
  camera: number
  pops: Pop[]
  perfect: number
  shake: number
  clock: number
}

export const stackTop = (world: World) => world.stack.length * BLOCK_H

export function spawnBlock(world: World) {
  const { w } = world.stack[world.stack.length - 1]
  const fromLeft = world.stack.length % 2 === 0
  world.block = { x: fromLeft ? 0 : WORLD_W - w, w, bottom: stackTop(world) + HOVER_GAP, dirX: fromLeft ? 1 : -1, falling: false, pressed: false }
}

export function createWorld(): World {
  const world = {
    status: 'ready', stack: [{ x: (WORLD_W - BASE_W) / 2, w: BASE_W }], debris: [], holding: false, score: 0,
    camera: 0, pops: [], perfect: 0, shake: 0, clock: 0,
  } as Omit<World, 'block'> as World
  spawnBlock(world)
  return world
}

export function lock(world: World) {
  const top = world.stack[world.stack.length - 1]
  const { block } = world
  const bottom = stackTop(world)
  const left = Math.max(block.x, top.x)
  const right = Math.min(block.x + block.w, top.x + top.w)
  const variant = world.stack.length

  if (right <= left) {
    world.debris.push({ x: block.x, w: block.w, bottom, vy: 0, variant })
    world.status = 'missed'
    world.shake = SHAKE_MS
    return
  }

  let slab: Slab
  if (Math.abs(block.x - top.x) <= PERFECT_PX) {
    const w = Math.min(BASE_W, top.w + PERFECT_RESTORE_PX)
    slab = { x: Math.min(Math.max(0, top.x - (w - top.w) / 2), WORLD_W - w), w }
    world.perfect = PERFECT_MS
  }
  else {
    slab = { x: left, w: right - left }
    world.debris.push({ x: block.x < top.x ? block.x : right, w: block.w - slab.w, bottom, vy: 0, variant })
  }
  world.stack.push(slab)
  world.score += 1
  world.pops.push({ x: slab.x + slab.w / 2, y: bottom, age: 0 })
  spawnBlock(world)
}

export function step(world: World, dt: number, viewH: number) {
  const ms = dt * 1000
  world.clock += ms
  world.perfect = Math.max(0, world.perfect - ms)
  world.pops = agePops(world.pops, ms)
  for (const piece of world.debris) {
    piece.vy += GRAVITY * dt
    piece.bottom -= piece.vy * dt
  }
  world.debris = world.debris.filter(piece => piece.bottom > world.camera - viewH)
  // Keep the hovering block about a quarter of the way down the screen.
  const target = Math.max(0, stackTop(world) + HOVER_GAP + BLOCK_H + GROUND_H - viewH * 0.75)
  world.camera += (target - world.camera) * Math.min(1, dt * 6)

  if (world.status === 'missed') {
    world.shake = Math.max(0, world.shake - ms)
    return
  }
  if (world.status !== 'playing')
    return

  const { block } = world
  if (block.falling) {
    block.bottom -= DROP_SPEED * dt
  }
  else {
    const speed = slideSpeed(world.score)
    block.x += block.dirX * speed * dt
    if (block.x <= 0 || block.x >= WORLD_W - block.w) {
      block.x = Math.min(Math.max(0, block.x), WORLD_W - block.w)
      block.dirX = block.x <= 0 ? 1 : -1
    }
    if (world.holding && block.pressed)
      block.bottom -= LOWER_SPEED * dt
  }
  if (block.bottom <= stackTop(world))
    lock(world)
}

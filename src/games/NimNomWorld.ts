import { createChasers, eatChaser, isActive, moveChaser, tickRespawn } from './NimNomChasers'
import type { Chaser } from './NimNomChasers'
import { COLS, layoutForWave } from './NimNomLayouts'
import type { Layout } from './NimNomLayouts'
import { advance, canMove, createMover, nearestTile, OPPOSITE, position, reverse } from './NimNomMovers'
import type { Mover } from './NimNomMovers'
import { agePops, SHAKE_MS } from './shared/effects'
import type { Pop } from './shared/effects'
import type { Dir } from './shared/sprites'

/** Tiles per second. */
const PLAYER_SPEED = 6
/** Centre-to-centre distance, in tiles, that counts as touching. */
const CATCH_DISTANCE = 0.6
export const COIN_POINTS = 20
export const SPOOKED_MS = 6000
/** The spooked look flashes for this long before it wears off. */
export const SPOOK_WARNING_MS = 1500
const SPOOK_FLASH_PERIOD_MS = 150
/** Points for the 1st, 2nd and 3rd spooked chaser eaten in one power window. */
export const EAT_CHAIN = [50, 100, 200]
/** Clearing wave N adds this times N. */
export const WAVE_BONUS_PER_WAVE = 10
export const WAVE_FLASH_MS = 100
export const WAVE_BANNER_MS = 600

/** Endless: a round only ends when a normal chaser touches the player. */
export type Status = 'ready' | 'playing' | 'caught'

export interface ScorePop extends Pop {
  kind: 'dot' | 'coin' | 'chaser'
  variant: number
}

export interface World {
  status: Status
  wave: number
  layout: Layout
  dots: boolean[]
  dotsLeft: number
  coins: boolean[]
  score: number
  player: Mover
  facing: Dir
  queued: Dir | null
  chasers: Chaser[]
  /** Time left in the current power window; 0 when nothing is spooked. */
  spookedMs: number
  /** Spooked chasers eaten in the current power window. */
  chain: number
  /** Pops in tile coordinates. */
  pops: ScorePop[]
  shake: number
  waveFlash: number
  banner: number
  clock: number
}

/** Everything that resets when a wave starts: maze, dots, coins, positions, chasers. */
function waveState(wave: number) {
  const layout = layoutForWave(wave)
  return {
    wave,
    layout,
    dots: [...layout.dots],
    dotsLeft: layout.dotCount,
    coins: [...layout.coins],
    player: createMover(layout.playerStart, PLAYER_SPEED),
    chasers: createChasers(layout, wave),
    spookedMs: 0,
    chain: 0,
  }
}

export function createWorld(): World {
  return {
    status: 'ready',
    score: 0,
    facing: 'right',
    queued: null,
    pops: [],
    shake: 0,
    waveFlash: 0,
    banner: 0,
    clock: 0,
    ...waveState(1),
  }
}

/** Sprite variant for a chaser: its own colour, spooked blue, or the wear-off flash. */
export function chaserLook(world: World, chaser: Chaser): number {
  if (!chaser.spooked)
    return chaser.id
  const warning = world.spookedMs <= SPOOK_WARNING_MS
  return warning && Math.floor(world.spookedMs / SPOOK_FLASH_PERIOD_MS) % 2 === 0 ? 4 : 3
}

const choosePlayerDir = (world: World) => (mover: Mover): Dir | null => {
  if (world.queued && canMove(world.layout, mover.col, mover.row, world.queued))
    return world.queued
  if (mover.dir && canMove(world.layout, mover.col, mover.row, mover.dir))
    return mover.dir
  return null
}

function clearWave(world: World) {
  world.score += WAVE_BONUS_PER_WAVE * world.wave
  Object.assign(world, waveState(world.wave + 1))
  world.waveFlash = WAVE_FLASH_MS
  world.banner = WAVE_BANNER_MS
}

/** A NIM coin: every chaser on the board is spooked, and the window and chain start over. */
function spook(world: World) {
  world.spookedMs = SPOOKED_MS
  world.chain = 0
  for (const chaser of world.chasers) {
    if (isActive(chaser))
      chaser.spooked = true
  }
}

export function step(world: World, dt: number) {
  const ms = dt * 1000
  world.clock += ms
  world.waveFlash = Math.max(0, world.waveFlash - ms)
  world.banner = Math.max(0, world.banner - ms)
  world.pops = agePops(world.pops, ms)

  if (world.status === 'caught') {
    world.shake = Math.max(0, world.shake - ms)
    return
  }
  if (world.status !== 'playing')
    return

  if (world.spookedMs > 0) {
    world.spookedMs = Math.max(0, world.spookedMs - ms)
    if (world.spookedMs === 0) {
      world.chain = 0
      for (const chaser of world.chasers) chaser.spooked = false
    }
  }
  for (const chaser of world.chasers) tickRespawn(chaser, ms)

  const { player } = world
  if (player.dir && world.queued === OPPOSITE[player.dir])
    reverse(player)
  advance(player, dt, choosePlayerDir(world))
  if (player.dir)
    world.facing = player.dir

  const [col, row] = nearestTile(player)
  const index = row * COLS + col
  if (world.dots[index]) {
    world.dots[index] = false
    world.dotsLeft -= 1
    world.score += 1
    world.pops.push({ x: col, y: row, age: 0, kind: 'dot', variant: 0 })
    if (world.dotsLeft === 0) {
      // Everyone starts the next wave exactly on their start tiles, so nothing else moves this frame.
      clearWave(world)
      return
    }
  }
  if (world.coins[index]) {
    world.coins[index] = false
    world.score += COIN_POINTS
    world.pops.push({ x: col, y: row, age: 0, kind: 'coin', variant: 0 })
    spook(world)
  }

  for (const chaser of world.chasers) moveChaser(world.layout, chaser, dt, player)

  const [px, py] = position(player)
  for (const chaser of world.chasers) {
    if (!isActive(chaser))
      continue
    const [cx, cy] = position(chaser)
    if (Math.hypot(px - cx, py - cy) >= CATCH_DISTANCE)
      continue
    if (!chaser.spooked) {
      world.status = 'caught'
      world.shake = SHAKE_MS
      return
    }
    world.score += EAT_CHAIN[Math.min(world.chain, EAT_CHAIN.length - 1)]
    world.chain += 1
    world.pops.push({ x: cx, y: cy, age: 0, kind: 'chaser', variant: 3 })
    eatChaser(chaser)
  }
}

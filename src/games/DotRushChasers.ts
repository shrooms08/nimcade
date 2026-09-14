import type { Layout } from './DotRushLayouts'
import { advance, canMove, createMover, DIRECTIONS, nearestTile, OPPOSITE, VECTORS } from './DotRushMovers'
import type { Mover, Tile } from './DotRushMovers'
import type { Dir } from './shared/sprites'

/** Tiles per second on wave 1. */
export const CHASER_SPEED = 5.1
export const CHASER_SPEED_PER_WAVE = 0.5
export const CHASER_MAX_SPEED = 8
/** Per chaser, in start-tile order: chance of a random turn at a junction. */
export const RANDOM_TURN = [0.2, 0.3, 0.4]
/** Spooked chasers slow down, so they can still be caught once they outpace the player. */
export const SPOOKED_SPEED_FACTOR = 0.6
export const RESPAWN_MS = 2000

export const chaserSpeed = (wave: number) =>
  Math.min(CHASER_MAX_SPEED, CHASER_SPEED + CHASER_SPEED_PER_WAVE * (wave - 1))

/** Wave 1: one chaser, wave 2: two, wave 3 on: three. */
export const chaserCount = (wave: number) => Math.min(RANDOM_TURN.length, wave)

export interface Chaser extends Mover {
  /** 0, 1 or 2: picks the start tile, colour and random-turn chance. */
  id: number
  start: Tile
  randomTurn: number
  spooked: boolean
  /** Counts down while eaten; the chaser is off the board until it reaches 0. */
  respawnMs: number
}

export function createChasers(layout: Layout, wave: number): Chaser[] {
  const speed = chaserSpeed(wave)
  return Array.from({ length: chaserCount(wave) }, (_, id) => ({
    ...createMover(layout.chaserStarts[id], speed),
    id,
    start: layout.chaserStarts[id],
    randomTurn: RANDOM_TURN[id],
    spooked: false,
    respawnMs: 0,
  }))
}

export const isActive = (chaser: Chaser) => chaser.respawnMs === 0

export function eatChaser(chaser: Chaser) {
  chaser.respawnMs = RESPAWN_MS
  chaser.spooked = false
}

/** Ticks an eaten chaser's countdown; at 0 it is back on its start tile, normal. */
export function tickRespawn(chaser: Chaser, ms: number) {
  if (chaser.respawnMs === 0)
    return
  chaser.respawnMs = Math.max(0, chaser.respawnMs - ms)
  if (chaser.respawnMs === 0)
    Object.assign(chaser, createMover(chaser.start, chaser.speed))
}

/**
 * Picks a direction when the chaser lands on a tile. Never reverses unless it
 * is in a dead end. At a junction it takes a random turn with its own chance;
 * otherwise a normal chaser closes the Manhattan distance to `target` and a
 * spooked one widens it.
 */
function chooseDir(layout: Layout, chaser: Chaser, target: Tile) {
  return (mover: Mover): Dir | null => {
    const back = mover.dir ? OPPOSITE[mover.dir] : null
    const options = DIRECTIONS.filter(dir => dir !== back && canMove(layout, mover.col, mover.row, dir))
    if (options.length === 0)
      return back
    if (options.length === 1)
      return options[0]

    const pick = (dirs: Dir[]) => dirs[Math.floor(Math.random() * dirs.length)]
    if (Math.random() < chaser.randomTurn)
      return pick(options)

    const distances = options.map((dir) => {
      const [dx, dy] = VECTORS[dir]
      return Math.abs(mover.col + dx - target[0]) + Math.abs(mover.row + dy - target[1])
    })
    const best = chaser.spooked ? Math.max(...distances) : Math.min(...distances)
    return pick(options.filter((_, i) => distances[i] === best))
  }
}

export function moveChaser(layout: Layout, chaser: Chaser, dt: number, player: Mover) {
  if (!isActive(chaser))
    return
  const step = chaser.spooked ? dt * SPOOKED_SPEED_FACTOR : dt
  advance(chaser, step, chooseDir(layout, chaser, nearestTile(player)))
}

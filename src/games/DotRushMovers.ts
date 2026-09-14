import { COLS, ROWS } from './DotRushLayouts'
import type { Layout } from './DotRushLayouts'
import type { Dir } from './shared/sprites'

export type Tile = [col: number, row: number]

export const VECTORS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
export const DIRECTIONS: Dir[] = ['up', 'left', 'down', 'right']

/** Moves tile to tile: at `t = 0` it sits on (col, row), at `t = 1` on (toCol, toRow). */
export interface Mover {
  col: number
  row: number
  toCol: number
  toRow: number
  t: number
  dir: Dir | null
  /** Tiles per second. */
  speed: number
}

export const isOpen = (layout: Layout, col: number, row: number) =>
  col >= 0 && col < COLS && row >= 0 && row < ROWS && !layout.walls[row * COLS + col]

export function canMove(layout: Layout, col: number, row: number, dir: Dir): boolean {
  const [dx, dy] = VECTORS[dir]
  return isOpen(layout, col + dx, row + dy)
}

export const createMover = ([col, row]: Tile, speed: number): Mover =>
  ({ col, row, toCol: col, toRow: row, t: 0, dir: null, speed })

export function position(mover: Mover): [number, number] {
  return [mover.col + (mover.toCol - mover.col) * mover.t, mover.row + (mover.toRow - mover.row) * mover.t]
}

/** The tile the mover mostly overlaps. */
export const nearestTile = (mover: Mover): Tile =>
  mover.t >= 0.5 ? [mover.toCol, mover.toRow] : [mover.col, mover.row]

function setHeading(mover: Mover, dir: Dir) {
  const [dx, dy] = VECTORS[dir]
  mover.dir = dir
  mover.toCol = mover.col + dx
  mover.toRow = mover.row + dy
}

/**
 * Advances a mover by `dt` seconds at its speed. `choose` runs every time it
 * lands on a tile and returns the next direction, or null to stop there.
 */
export function advance(mover: Mover, dt: number, choose: (mover: Mover) => Dir | null) {
  if (mover.dir === null) {
    const next = choose(mover)
    if (next === null)
      return
    setHeading(mover, next)
    mover.t = 0
  }
  mover.t += mover.speed * dt
  while (mover.t >= 1) {
    mover.col = mover.toCol
    mover.row = mover.toRow
    mover.t -= 1
    const next = choose(mover)
    if (next === null) {
      mover.dir = null
      mover.t = 0
      return
    }
    setHeading(mover, next)
  }
}

/** Reversing is always legal, so it applies mid-tile instead of waiting for the next tile. */
export function reverse(mover: Mover) {
  if (!mover.dir)
    return
  ;[mover.col, mover.toCol] = [mover.toCol, mover.col]
  ;[mover.row, mover.toRow] = [mover.toRow, mover.row]
  mover.t = 1 - mover.t
  mover.dir = OPPOSITE[mover.dir]
}

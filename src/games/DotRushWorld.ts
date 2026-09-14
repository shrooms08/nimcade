import { agePops, ROUND_SECONDS, SHAKE_MS } from './shared/effects'
import type { Pop } from './shared/effects'
import type { Dir } from './shared/sprites'

/** '#' wall, '.' dot, ' ' empty, 'P' player start, 'C' chaser start. */
export const MAZE = [
  '###########',
  '#....#....#',
  '#.##.#.##.#',
  '#....C....#',
  '#.#.###.#.#',
  '#.#..#..#.#',
  '#.##.#.##.#',
  '#.........#',
  '#.###.###.#',
  '#...#.#...#',
  '###.#.#.###',
  '#.........#',
  '#.##.#.##.#',
  '#....P....#',
  '###########',
]

export const COLS = MAZE[0].length
export const ROWS = MAZE.length

/** Tiles per second. */
const PLAYER_SPEED = 6
export const CHASER_SPEED = 5.1
/** Added to CHASER_SPEED for every wave after the first. */
export const CHASER_SPEED_PER_WAVE = 0.5
const CHASER_RANDOM_TURN = 0.2
/** Centre-to-centre distance, in tiles, that counts as a capture. */
const CATCH_DISTANCE = 0.6
export const WAVE_BONUS = 10
export const WAVE_FLASH_MS = 100
export const WAVE_BANNER_MS = 600

const VECTORS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
const DIRECTIONS: Dir[] = ['up', 'left', 'down', 'right']

export const WALLS = MAZE.flatMap(row => [...row].map(ch => ch === '#'))
const freshDots = () => MAZE.flatMap(row => [...row].map(ch => ch === '.'))
export const DOT_COUNT = freshDots().filter(Boolean).length

function findStart(marker: string): [number, number] {
  const row = MAZE.findIndex(line => line.includes(marker))
  if (row === -1)
    throw new Error(`Dot Rush maze is missing its '${marker}' start tile`)
  return [MAZE[row].indexOf(marker), row]
}

const PLAYER_START = findStart('P')
const CHASER_START = findStart('C')

const isOpen = (col: number, row: number) =>
  col >= 0 && col < COLS && row >= 0 && row < ROWS && !WALLS[row * COLS + col]

function canMove(col: number, row: number, dir: Dir): boolean {
  const [dx, dy] = VECTORS[dir]
  return isOpen(col + dx, row + dy)
}

/** Moves tile to tile: at `t = 0` it sits on (col, row), at `t = 1` on (toCol, toRow). */
export interface Mover {
  col: number
  row: number
  toCol: number
  toRow: number
  t: number
  dir: Dir | null
  speed: number
}

export type Status = 'ready' | 'playing' | 'caught' | 'over'

export interface World {
  status: Status
  dots: boolean[]
  dotsLeft: number
  /** Dots eaten plus WAVE_BONUS per cleared wave. */
  score: number
  /** 1 for the first maze, +1 each time every dot is eaten. */
  wave: number
  timeLeft: number
  player: Mover
  facing: Dir
  queued: Dir | null
  chaser: Mover
  /** Pops in tile coordinates. */
  pops: Pop[]
  shake: number
  flash: number
  waveFlash: number
  banner: number
  clock: number
}

const createMover = ([col, row]: [number, number], speed: number): Mover =>
  ({ col, row, toCol: col, toRow: row, t: 0, dir: null, speed })

export function createWorld(): World {
  return {
    status: 'ready',
    dots: freshDots(),
    dotsLeft: DOT_COUNT,
    score: 0,
    wave: 1,
    timeLeft: ROUND_SECONDS,
    player: createMover(PLAYER_START, PLAYER_SPEED),
    facing: 'right',
    queued: null,
    chaser: createMover(CHASER_START, CHASER_SPEED),
    pops: [],
    shake: 0,
    flash: 0,
    waveFlash: 0,
    banner: 0,
    clock: 0,
  }
}

export function position(mover: Mover): [number, number] {
  return [mover.col + (mover.toCol - mover.col) * mover.t, mover.row + (mover.toRow - mover.row) * mover.t]
}

/** The tile the mover mostly overlaps. */
const nearestTile = (mover: Mover): [number, number] =>
  mover.t >= 0.5 ? [mover.toCol, mover.toRow] : [mover.col, mover.row]

function setHeading(mover: Mover, dir: Dir) {
  const [dx, dy] = VECTORS[dir]
  mover.dir = dir
  mover.toCol = mover.col + dx
  mover.toRow = mover.row + dy
}

/** `choose` runs every time the mover lands on a tile; null stops it there. */
function advance(mover: Mover, dt: number, choose: (mover: Mover) => Dir | null) {
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

const choosePlayerDir = (world: World) => (mover: Mover): Dir | null => {
  if (world.queued && canMove(mover.col, mover.row, world.queued))
    return world.queued
  if (mover.dir && canMove(mover.col, mover.row, mover.dir))
    return mover.dir
  return null
}

const chooseChaserDir = (world: World) => (mover: Mover): Dir | null => {
  const back = mover.dir ? OPPOSITE[mover.dir] : null
  const options = DIRECTIONS.filter(dir => dir !== back && canMove(mover.col, mover.row, dir))
  if (options.length === 0)
    return back
  if (options.length === 1)
    return options[0]

  // An intersection: usually close in, sometimes wander.
  const pick = (dirs: Dir[]) => dirs[Math.floor(Math.random() * dirs.length)]
  if (Math.random() < CHASER_RANDOM_TURN)
    return pick(options)

  const [targetCol, targetRow] = nearestTile(world.player)
  const distanceFor = (dir: Dir) => {
    const [dx, dy] = VECTORS[dir]
    return Math.abs(mover.col + dx - targetCol) + Math.abs(mover.row + dy - targetRow)
  }
  const shortest = Math.min(...options.map(distanceFor))
  return pick(options.filter(dir => distanceFor(dir) === shortest))
}

/** Every dot eaten: bank the bonus, refill the maze, send both back to start. */
function clearWave(world: World) {
  world.wave += 1
  world.score += WAVE_BONUS
  world.dots = freshDots()
  world.dotsLeft = DOT_COUNT
  world.player = createMover(PLAYER_START, PLAYER_SPEED)
  world.chaser = createMover(CHASER_START, CHASER_SPEED + CHASER_SPEED_PER_WAVE * (world.wave - 1))
  world.waveFlash = WAVE_FLASH_MS
  world.banner = WAVE_BANNER_MS
}

export function step(world: World, dt: number) {
  const ms = dt * 1000
  world.clock += ms
  world.flash = Math.max(0, world.flash - ms)
  world.waveFlash = Math.max(0, world.waveFlash - ms)
  world.banner = Math.max(0, world.banner - ms)
  world.pops = agePops(world.pops, ms)

  if (world.status === 'caught') {
    world.shake = Math.max(0, world.shake - ms)
    return
  }
  if (world.status !== 'playing')
    return

  world.timeLeft = Math.max(0, world.timeLeft - dt)

  const { player } = world
  // Reversing is always legal, so it applies immediately instead of waiting
  // for the next tile — otherwise backing away from the chaser feels laggy.
  if (player.dir && world.queued === OPPOSITE[player.dir]) {
    ;[player.col, player.toCol] = [player.toCol, player.col]
    ;[player.row, player.toRow] = [player.toRow, player.row]
    player.t = 1 - player.t
    player.dir = world.queued
  }
  advance(player, dt, choosePlayerDir(world))
  if (player.dir)
    world.facing = player.dir

  const [eatCol, eatRow] = nearestTile(player)
  const index = eatRow * COLS + eatCol
  if (world.dots[index]) {
    world.dots[index] = false
    world.dotsLeft -= 1
    world.score += 1
    world.pops.push({ x: eatCol, y: eatRow, age: 0 })
    if (world.dotsLeft === 0) {
      // Both movers start the new wave exactly on their start tiles, so
      // nothing else moves this frame.
      clearWave(world)
      return
    }
  }

  advance(world.chaser, dt, chooseChaserDir(world))

  const [px, py] = position(world.player)
  const [cx, cy] = position(world.chaser)
  if (Math.hypot(px - cx, py - cy) < CATCH_DISTANCE) {
    world.status = 'caught'
    world.shake = SHAKE_MS
  }
  else if (world.timeLeft <= 0) {
    world.status = 'over'
  }
}

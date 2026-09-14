/**
 * Dot Rush mazes. Legend: '#' wall, '.' dot, ' ' empty, 'P' player start,
 * 'C' chaser start (read in order: the first C is chaser 1), 'N' NIM coin.
 * Waves cycle through LAYOUTS in order.
 */

export const COLS = 11
export const ROWS = 15
export const CHASER_SLOTS = 3
export const COINS_PER_LAYOUT = 2

type Tile = [col: number, row: number]

export interface Layout {
  name: string
  walls: boolean[]
  /** Template for a fresh wave; copy before mutating. */
  dots: boolean[]
  coins: boolean[]
  dotCount: number
  playerStart: Tile
  chaserStarts: Tile[]
}

const CLASSIC = [
  '###########',
  '#N...#...N#',
  '#.##.#.##.#',
  '#....C....#',
  '#.#.###.#.#',
  '#.#..#..#.#',
  '#.##.#.##.#',
  '#C.......C#',
  '#.###.###.#',
  '#...#.#...#',
  '###.#.#.###',
  '#.........#',
  '#.##.#.##.#',
  '#....P....#',
  '###########',
]

/** More corridors and an open room in the middle. */
const ATRIUM = [
  '###########',
  '#....C....#',
  '#.#.###.#.#',
  '#N.......N#',
  '##.#.#.#.##',
  '#..#...#..#',
  '#.##...##.#',
  '#C.......C#',
  '#.##...##.#',
  '#..#...#..#',
  '##.#.#.#.##',
  '#.........#',
  '#.#.###.#.#',
  '#....P....#',
  '###########',
]

/** A long outer ring, inner loops, and two dead-end pockets holding the coins. */
const RINGS = [
  '###########',
  '#.........#',
  '#.#######.#',
  '#.#..C..#.#',
  '#.#.###.#.#',
  '#...#N#...#',
  '#.#.#.#.#.#',
  '#C#.....#C#',
  '#.#.###.#.#',
  '#...#N#...#',
  '#.#.#.#.#.#',
  '#.#.....#.#',
  '#.#######.#',
  '#....P....#',
  '###########',
]

function parse(name: string, rows: string[]): Layout {
  if (rows.length !== ROWS || rows.some(row => row.length !== COLS))
    throw new Error(`Dot Rush layout "${name}" must be ${COLS}x${ROWS}`)

  const cells = rows.flatMap(row => [...row])
  const tilesOf = (marker: string): Tile[] =>
    cells.flatMap((ch, index) => (ch === marker ? [[index % COLS, Math.floor(index / COLS)] as Tile] : []))

  const players = tilesOf('P')
  const chasers = tilesOf('C')
  const coins = tilesOf('N')
  if (players.length !== 1 || chasers.length < CHASER_SLOTS || coins.length !== COINS_PER_LAYOUT)
    throw new Error(`Dot Rush layout "${name}" needs 1 P, ${CHASER_SLOTS} C and ${COINS_PER_LAYOUT} N tiles`)

  const dots = cells.map(ch => ch === '.')
  return {
    name,
    walls: cells.map(ch => ch === '#'),
    dots,
    coins: cells.map(ch => ch === 'N'),
    dotCount: dots.filter(Boolean).length,
    playerStart: players[0],
    chaserStarts: chasers.slice(0, CHASER_SLOTS),
  }
}

export const LAYOUT_ROWS: Record<string, string[]> = { classic: CLASSIC, atrium: ATRIUM, rings: RINGS }

export const LAYOUTS: Layout[] = Object.entries(LAYOUT_ROWS).map(([name, rows]) => parse(name, rows))

/** Wave 1 -> layout 1, 2 -> 2, 3 -> 3, 4 -> 1, ... */
export const layoutForWave = (wave: number): Layout => LAYOUTS[(wave - 1) % LAYOUTS.length]

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { readBest } from '../lib/scores'
import { sprites } from './DotRushSprites'
import type { Dir, SpriteState } from './DotRushSprites'
import type { GameProps } from './types'

export const DOT_RUSH_ID = 'dot-rush'

/** '#' wall, '.' dot, ' ' empty, 'P' player start, 'C' chaser start. */
const MAZE = [
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

const COLS = MAZE[0].length
const ROWS = MAZE.length

const ROUND_SECONDS = 20
/** Tiles per second. */
const PLAYER_SPEED = 6
const CHASER_SPEED = 5.1
const CHASER_RANDOM_TURN = 0.2
/** Centre-to-centre distance, in tiles, that counts as a capture. */
const CATCH_DISTANCE = 0.6
const SHAKE_MS = 150
const SHAKE_PX = 4
const POP_MS = 180
const FLASH_MS = 320
const URGENT_SECONDS = 3
const MAX_DPR = 2
/** Clamp for long frames (tab switch, GC pause) so movers never skip tiles. */
const MAX_STEP_SECONDS = 1 / 30

const VECTORS: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
const DIRECTIONS: Dir[] = ['up', 'left', 'down', 'right']

const WALLS = MAZE.flatMap(row => [...row].map(ch => ch === '#'))

function findStart(marker: string): [number, number] {
  const row = MAZE.findIndex(line => line.includes(marker))
  if (row === -1)
    throw new Error(`Dot Rush maze is missing its '${marker}' start tile`)
  return [MAZE[row].indexOf(marker), row]
}

const PLAYER_START = findStart('P')
const CHASER_START = findStart('C')

function isOpen(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS && !WALLS[row * COLS + col]
}

function canMove(col: number, row: number, dir: Dir): boolean {
  const [dx, dy] = VECTORS[dir]
  return isOpen(col + dx, row + dy)
}

/** Moves tile to tile: at `t = 0` it sits on (col, row), at `t = 1` on (toCol, toRow). */
interface Mover {
  col: number
  row: number
  toCol: number
  toRow: number
  t: number
  dir: Dir | null
  speed: number
}

type Status = 'ready' | 'playing' | 'caught' | 'over'

interface Pop {
  col: number
  row: number
  age: number
}

interface World {
  status: Status
  dots: boolean[]
  dotsLeft: number
  score: number
  timeLeft: number
  player: Mover
  facing: Dir
  queued: Dir | null
  chaser: Mover
  pops: Pop[]
  shake: number
  flash: number
  clock: number
}

function createMover([col, row]: [number, number], speed: number): Mover {
  return { col, row, toCol: col, toRow: row, t: 0, dir: null, speed }
}

function createWorld(): World {
  const dots = MAZE.flatMap(row => [...row].map(ch => ch === '.'))
  return {
    status: 'ready',
    dots,
    dotsLeft: dots.filter(Boolean).length,
    score: 0,
    timeLeft: ROUND_SECONDS,
    player: createMover(PLAYER_START, PLAYER_SPEED),
    facing: 'right',
    queued: null,
    chaser: createMover(CHASER_START, CHASER_SPEED),
    pops: [],
    shake: 0,
    flash: 0,
    clock: 0,
  }
}

function position(mover: Mover): [number, number] {
  return [
    mover.col + (mover.toCol - mover.col) * mover.t,
    mover.row + (mover.toRow - mover.row) * mover.t,
  ]
}

/** The tile the mover mostly overlaps. */
function nearestTile(mover: Mover): [number, number] {
  return mover.t >= 0.5 ? [mover.toCol, mover.toRow] : [mover.col, mover.row]
}

/**
 * Advances a mover along its path. `choose` runs every time it lands on a tile
 * and returns the next direction, or null to stop there.
 */
function advance(mover: Mover, dt: number, choose: (mover: Mover) => Dir | null) {
  if (mover.dir === null) {
    const next = choose(mover)
    if (next === null)
      return
    const [dx, dy] = VECTORS[next]
    mover.dir = next
    mover.toCol = mover.col + dx
    mover.toRow = mover.row + dy
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
    const [dx, dy] = VECTORS[next]
    mover.dir = next
    mover.toCol = mover.col + dx
    mover.toRow = mover.row + dy
  }
}

function choosePlayerDir(world: World) {
  return (mover: Mover): Dir | null => {
    if (world.queued && canMove(mover.col, mover.row, world.queued))
      return world.queued
    if (mover.dir && canMove(mover.col, mover.row, mover.dir))
      return mover.dir
    return null
  }
}

function chooseChaserDir(world: World) {
  return (mover: Mover): Dir | null => {
    const back = mover.dir ? OPPOSITE[mover.dir] : null
    const options = DIRECTIONS.filter(dir => dir !== back && canMove(mover.col, mover.row, dir))

    if (options.length === 0)
      return back
    if (options.length === 1)
      return options[0]

    // An intersection: usually close in, sometimes wander.
    if (Math.random() < CHASER_RANDOM_TURN)
      return options[Math.floor(Math.random() * options.length)]

    const [targetCol, targetRow] = nearestTile(world.player)
    let best: Dir[] = []
    let bestDistance = Number.POSITIVE_INFINITY
    for (const dir of options) {
      const [dx, dy] = VECTORS[dir]
      const distance = Math.abs(mover.col + dx - targetCol) + Math.abs(mover.row + dy - targetRow)
      if (distance < bestDistance) {
        best = [dir]
        bestDistance = distance
      }
      else if (distance === bestDistance) {
        best.push(dir)
      }
    }
    return best[Math.floor(Math.random() * best.length)]
  }
}

function step(world: World, dt: number) {
  const ms = dt * 1000
  world.clock += ms
  world.flash = Math.max(0, world.flash - ms)
  world.pops = world.pops
    .map(pop => ({ ...pop, age: pop.age + ms }))
    .filter(pop => pop.age < POP_MS)

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
    world.pops.push({ col: eatCol, row: eatRow, age: 0 })
  }

  advance(world.chaser, dt, chooseChaserDir(world))

  const [px, py] = position(player)
  const [cx, cy] = position(world.chaser)
  if (Math.hypot(px - cx, py - cy) < CATCH_DISTANCE) {
    world.status = 'caught'
    world.shake = SHAKE_MS
  }
  else if (world.timeLeft <= 0 || world.dotsLeft === 0) {
    world.status = 'over'
  }
}

type Phase = 'ready' | 'playing' | 'over'

interface Result {
  score: number
  best: number
  caught: boolean
}

const PAD: { dir: Dir; label: string; path: string }[] = [
  { dir: 'up', label: 'Up', path: 'M6 15l6-6 6 6' },
  { dir: 'left', label: 'Left', path: 'M15 6l-6 6 6 6' },
  { dir: 'down', label: 'Down', path: 'M6 9l6 6 6-6' },
  { dir: 'right', label: 'Right', path: 'M9 6l6 6-6 6' },
]

export default function DotRush({ active, onScore }: GameProps) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<Result | null>(null)
  const [prevActive, setPrevActive] = useState(active)

  // Leaving or entering the viewport always lands on a fresh, unstarted round.
  if (prevActive !== active) {
    setPrevActive(active)
    setPhase('ready')
    setResult(null)
  }

  const worldRef = useRef<World>(createWorld())
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const countdownRef = useRef<HTMLSpanElement | null>(null)
  const scoreRef = useRef<HTMLSpanElement | null>(null)
  const viewRef = useRef({ tile: 0, dpr: 1 })
  const frameRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const onScoreRef = useRef(onScore)

  useEffect(() => {
    onScoreRef.current = onScore
  }, [onScore])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const { tile, dpr } = viewRef.current
    if (!canvas || !ctx || tile === 0)
      return

    const world = worldRef.current
    const width = COLS * tile
    const height = ROWS * tile
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    const base: SpriteState = { time: world.clock, facing: world.facing, scale: 1, alpha: 1 }

    ctx.fillStyle = '#0c0e24'
    ctx.fillRect(0, 0, width, height)

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const index = row * COLS + col
        if (WALLS[index])
          sprites.wall(ctx, col * tile, row * tile, tile, base)
        else if (world.dots[index])
          sprites.dot(ctx, col * tile, row * tile, tile, base)
      }
    }

    for (const pop of world.pops) {
      const progress = pop.age / POP_MS
      sprites.dot(ctx, pop.col * tile, pop.row * tile, tile, {
        ...base,
        scale: 1 + progress * 1.6,
        alpha: 1 - progress,
      })
    }

    const [px, py] = position(world.player)
    sprites.player(ctx, px * tile, py * tile, tile, base)
    const [cx, cy] = position(world.chaser)
    sprites.chaser(ctx, cx * tile, cy * tile, tile, base)

    if (world.flash > 0) {
      ctx.fillStyle = `rgba(217, 68, 50, ${(0.22 * world.flash) / FLASH_MS})`
      ctx.fillRect(0, 0, width, height)
    }

    if (world.shake > 0) {
      const sx = Math.random() < 0.5 ? -SHAKE_PX : SHAKE_PX
      const sy = Math.random() < 0.5 ? -SHAKE_PX : SHAKE_PX
      canvas.style.transform = `translate(${sx}px, ${sy}px)`
    }
    else if (canvas.style.transform) {
      canvas.style.transform = ''
    }
  }, [])

  const updateHud = useCallback(() => {
    const world = worldRef.current
    const countdown = countdownRef.current
    if (countdown) {
      const seconds = String(Math.ceil(world.timeLeft))
      if (countdown.textContent !== seconds)
        countdown.textContent = seconds
      countdown.classList.toggle(
        'is-urgent',
        world.status === 'playing' && world.timeLeft <= URGENT_SECONDS,
      )
    }
    if (scoreRef.current)
      scoreRef.current.textContent = String(world.score)
  }, [])

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const finish = useCallback((world: World) => {
    const best = Math.max(readBest(DOT_RUSH_ID), world.score)
    setResult({ score: world.score, best, caught: world.status === 'caught' })
    setPhase('over')
    onScoreRef.current(world.score)
  }, [])

  const tick = useCallback(
    function loop(now: number) {
      const world = worldRef.current
      const dt = Math.min((now - lastFrameRef.current) / 1000, MAX_STEP_SECONDS)
      lastFrameRef.current = now

      const shownBefore = Math.ceil(world.timeLeft)
      step(world, dt)
      const shownAfter = Math.ceil(world.timeLeft)

      if (world.status === 'playing' && shownAfter !== shownBefore && shownAfter <= URGENT_SECONDS && shownAfter > 0) {
        world.flash = FLASH_MS
        const countdown = countdownRef.current
        if (countdown) {
          countdown.classList.remove('is-flash')
          void countdown.offsetWidth // restart the CSS animation
          countdown.classList.add('is-flash')
        }
      }

      let ended = false
      if (world.status === 'caught' && world.shake === 0) {
        ended = true
      }
      else if (world.status === 'over') {
        ended = true
      }

      updateHud()
      draw()

      if (ended) {
        frameRef.current = null
        finish(world)
        return
      }
      frameRef.current = requestAnimationFrame(loop)
    },
    [draw, finish, updateHud],
  )

  const startLoop = useCallback(() => {
    if (frameRef.current !== null)
      return
    lastFrameRef.current = performance.now()
    frameRef.current = requestAnimationFrame(tick)
  }, [tick])

  const resetRound = useCallback(() => {
    stopLoop()
    worldRef.current = createWorld()
    countdownRef.current?.classList.remove('is-flash', 'is-urgent')
    updateHud()
    draw()
  }, [draw, stopLoop, updateHud])

  // Pause and fully reset whenever `active` flips; a fresh round waits for
  // the first d-pad press so the timer never runs unseen.
  useEffect(() => {
    resetRound()
    return stopLoop
  }, [active, resetRound, stopLoop])

  // Keep the canvas pixel-exact for its container.
  useEffect(() => {
    const board = boardRef.current
    const canvas = canvasRef.current
    if (!board || !canvas)
      return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const tile = Math.max(1, Math.floor(Math.min(width / COLS, height / ROWS)))
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      viewRef.current = { tile, dpr }
      canvas.style.width = `${COLS * tile}px`
      canvas.style.height = `${ROWS * tile}px`
      canvas.width = Math.round(COLS * tile * dpr)
      canvas.height = Math.round(ROWS * tile * dpr)
      draw()
    })
    observer.observe(board)
    return () => observer.disconnect()
  }, [draw])

  // Nothing that starts inside the play surface may scroll the feed. These
  // are native listeners because React's are passive and cannot cancel.
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface)
      return

    const stop = (event: TouchEvent) => event.stopPropagation()
    const block = (event: TouchEvent) => {
      event.stopPropagation()
      if (event.cancelable)
        event.preventDefault()
    }
    surface.addEventListener('touchstart', stop, { passive: true })
    surface.addEventListener('touchmove', block, { passive: false })
    surface.addEventListener('touchend', stop, { passive: true })
    return () => {
      surface.removeEventListener('touchstart', stop)
      surface.removeEventListener('touchmove', block)
      surface.removeEventListener('touchend', stop)
    }
  }, [])

  const press = useCallback(
    (dir: Dir, event: ReactPointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (!active)
        return

      const world = worldRef.current
      if (world.status === 'caught' || world.status === 'over')
        return

      world.queued = dir
      if (world.status === 'ready') {
        world.status = 'playing'
        setPhase('playing')
        startLoop()
      }
    },
    [active, startLoop],
  )

  const playAgain = useCallback(() => {
    resetRound()
    setResult(null)
    setPhase('ready')
  }, [resetRound])

  return (
    <div className="dot-rush">
      <div
        ref={surfaceRef}
        className="dot-rush__surface"
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="dot-rush__hud">
          <span className="dot-rush__stat">
            <span className="dot-rush__stat-label">Dots</span>
            <span ref={scoreRef} className="dot-rush__stat-value">0</span>
          </span>
          <span ref={countdownRef} className="dot-rush__countdown" aria-live="off">
            {ROUND_SECONDS}
          </span>
          <span aria-hidden="true" />
        </div>

        <div ref={boardRef} className="dot-rush__board">
          <canvas ref={canvasRef} className="dot-rush__canvas" />
          {phase === 'ready' && (
            <p className="dot-rush__hint">Tap an arrow to start</p>
          )}
        </div>

        <div className="dot-rush__pad">
          {PAD.map(({ dir, label, path }) => (
            <button
              key={dir}
              type="button"
              className={`dot-rush__key dot-rush__key--${dir}`}
              aria-label={label}
              onPointerDown={event => press(dir, event)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={path} />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {phase === 'over' && result && (
        <div className="dot-rush__end game__panel" data-feed-scroll>
          <p className="dot-rush__end-title">{result.caught ? 'Caught!' : 'Time!'}</p>
          <p className="game__score">{result.score}</p>
          <p className="game__verdict">
            {result.score === result.best && result.score > 0 ? 'New best' : `Best ${result.best}`}
          </p>
          <button type="button" className="button button--primary" onClick={playAgain}>
            Play again
          </button>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { sprites } from './FlipDodgeSprites'
import { agePops, applyShake, popLook, SHAKE_MS } from './shared/effects'
import type { Pop } from './shared/effects'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { spriteState } from './shared/sprites'
import { beginFrame, fillBoard, useCanvasBoard } from './shared/useCanvasBoard'
import { useGameLoop } from './shared/useGameLoop'
import { useRound } from './shared/useRound'
import type { GameProps } from './types'

export const FLIP_DODGE_ID = 'flip-dodge'

/** Game units: the road is always WORLD_W units wide, split into two lanes. */
const WORLD_W = 200
/** Share of the canvas width the road takes, centred; the rest is dark margin. */
const ROAD_SHARE = 0.6
const LANE_X = [50, 150]
const PLAYER_SIZE = 56
/** Player centre, measured up from the bottom of the board. */
const PLAYER_FROM_BOTTOM = 80
const OBSTACLE_W = 76
const OBSTACLE_H = 30
const COIN_SIZE = 56
/** Road speed at 1x, in units per second. Keeps the 3.5x flip window at 200ms+. */
const BASE_SPEED = 102
/** Speed factor keyframes [seconds, factor], linear between them, holding after the last. */
const RAMP: [number, number][] = [[0, 1], [15, 2], [45, 3], [90, 3.5]]
const MAX_FACTOR = RAMP[RAMP.length - 1][1]
/**
 * Row spacing tightens linearly with speed. Flip window between back-to-back
 * barrier rows = (gap - 2 * HIT_Y) / speed: ~1000ms at 1x, ~441ms at 2x,
 * ~255ms at 3x, ~202ms at 3.5x.
 */
const ROW_GAP_SLOW = 150
const ROW_GAP_FAST = 120
const FIRST_ROW_Y = -60
/** When a round starts, rows are already laid out from this far above the critter. */
const FIRST_ROW_LEAD = 160
const FLIP_SECONDS = 0.1
/** How close (in units) the player and an object must be to touch. */
const HIT_X = 50
const HIT_Y = 24
const DASH_GAP = 60

/** Rows repeat barrier, barrier, rest: a rest row has coins in both lanes and no barrier. */
const ROW_CYCLE = 3
const BARRIER_ROWS_PER_CYCLE = 2
/** At most this many barrier rows in a row may block the same lane (rest rows don't reset it). */
const MAX_SAME_LANE = 3

interface Thing { lane: 0 | 1; y: number; kind: 'barrier' | 'coin' }

interface World {
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

function createWorld(): World {
  return {
    status: 'ready', lane: 0, flip: 1, things: [], rowsSpawned: 0, streakLane: 0, streak: 0, untilRow: 0, distance: 0, score: 0,
    elapsed: 0, seeded: false, pops: [], shake: 0, clock: 0,
  }
}

function speedFactor(elapsed: number): number {
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
const flipWindowMs = (factor: number) => Math.round(((rowGap(factor) - 2 * HIT_Y) / (BASE_SPEED * factor)) * 1000)

/** Game units visible top to bottom for a canvas of this size. */
const unitsTall = (width: number, height: number) => (width ? height / ((width * ROAD_SHARE) / WORLD_W) : 600)

function playerX(world: World): number {
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

function step(world: World, dt: number, viewH: number) {
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

export default function FlipDodge({ active, onScore }: GameProps) {
  const round = useRound(FLIP_DODGE_ID, active, onScore)
  const worldRef = useRef<World>(createWorld())
  const scoreRef = useRef<HTMLSpanElement | null>(null)
  const speedRef = useRef<HTMLSpanElement | null>(null)
  const { boardRef, canvasRef, viewRef, onResizeRef } = useCanvasBoard(fillBoard)

  const draw = useCallback(() => {
    const world = worldRef.current
    const canvas = canvasRef.current
    const view = viewRef.current
    const ctx = beginFrame(canvas, view)
    if (!ctx)
      return

    const roadW = view.width * ROAD_SHARE
    const roadLeft = (view.width - roadW) / 2
    const k = roadW / WORLD_W
    const viewH = view.height / k
    const base = spriteState(world.clock, { facing: 'up' })
    const box = (cx: number, cy: number, w: number, h: number) =>
      [roadLeft + (cx - w / 2) * k, (cy - h / 2) * k, w * k, h * k] as const

    sprites.margin(ctx, 0, 0, view.width, view.height, base)
    sprites.road(ctx, roadLeft, 0, roadW, view.height, { ...base, variant: world.distance * k })
    for (let y = (world.distance % DASH_GAP) - DASH_GAP; y < viewH; y += DASH_GAP)
      sprites.dash(ctx, ...box(WORLD_W / 2, y, 3, DASH_GAP / 2), base)

    for (const thing of world.things) {
      if (thing.kind === 'barrier')
        sprites.barrier(ctx, ...box(LANE_X[thing.lane], thing.y, OBSTACLE_W, OBSTACLE_H), base)
      else
        sprites.coin(ctx, ...box(LANE_X[thing.lane], thing.y, COIN_SIZE, COIN_SIZE), base)
    }
    for (const pop of world.pops)
      sprites.coin(ctx, ...box(pop.x, pop.y, COIN_SIZE, COIN_SIZE), { ...base, ...popLook(pop.age) })

    const bob = world.status === 'playing' ? Math.round(Math.sin(world.clock / 70) * 2) : 0
    sprites.player(ctx, ...box(playerX(world), viewH - PLAYER_FROM_BOTTOM + bob, PLAYER_SIZE, PLAYER_SIZE), base)

    applyShake(canvas, world.shake)
  }, [canvasRef, viewRef])

  useEffect(() => {
    onResizeRef.current = draw
  }, [draw, onResizeRef])

  const { start, stop } = useGameLoop((dt) => {
    const world = worldRef.current
    const view = viewRef.current
    step(world, dt, unitsTall(view.width, view.height))
    if (scoreRef.current)
      scoreRef.current.textContent = String(world.score)
    const speed = `x${speedFactor(world.elapsed).toFixed(1)}`
    if (speedRef.current && speedRef.current.textContent !== speed)
      speedRef.current.textContent = speed
    draw()

    if (world.status === 'crashed' && world.shake === 0) {
      round.finish(world.score, 'Crashed!')
      return false
    }
    return true
  })

  const resetRound = useCallback(() => {
    stop()
    worldRef.current = createWorld()
    if (scoreRef.current)
      scoreRef.current.textContent = '0'
    if (speedRef.current)
      speedRef.current.textContent = 'x1.0'
    draw()
  }, [draw, stop])

  useEffect(() => {
    resetRound()
    return stop
  }, [active, resetRound, stop])

  const tap = (event: ReactPointerEvent) => {
    event.stopPropagation()
    const world = worldRef.current
    if (!active)
      return
    if (world.status === 'ready') {
      world.status = 'playing'
      if (import.meta.env.DEV) // stripped from production builds
        console.info(`[Flip Dodge] flip window: 1x ${flipWindowMs(1)}ms, 2x ${flipWindowMs(2)}ms, 3x ${flipWindowMs(3)}ms, 3.5x ${flipWindowMs(3.5)}ms`)
      round.begin()
      start()
      return
    }
    if (world.status !== 'playing')
      return
    world.lane = world.lane === 0 ? 1 : 0
    // Flipping mid-flip reverses from where the critter currently is.
    world.flip = 1 - world.flip
  }


  return (
    <div className="game-shell">
      <div className="game-surface" onPointerDown={tap}>
        <GameHud label="Coins" scoreRef={scoreRef} secondaryLabel="Speed" secondaryRef={speedRef} secondaryInitial="x1.0" />
        <div ref={boardRef} className="game-board">
          <canvas ref={canvasRef} className="game-canvas" />
          {round.phase === 'ready' && <p className="game-hint">Tap to run, tap to flip lanes</p>}
        </div>
      </div>
      {round.phase === 'over' && round.result && (
        <EndPanel reason={round.result.reason} score={round.result.score} best={round.result.best} />
      )}
    </div>
  )
}

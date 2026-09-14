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
import { usePlaySurface } from './shared/usePlaySurface'
import { useRound } from './shared/useRound'
import type { GameProps } from './types'

export const FLIP_DODGE_ID = 'flip-dodge'

/** Game units: the canvas is always WORLD_W units wide, split into two lanes. */
const WORLD_W = 200
const LANE_X = [50, 150]
const PLAYER_SIZE = 56
/** Player centre, measured up from the bottom of the board. */
const PLAYER_FROM_BOTTOM = 80
const OBSTACLE_W = 76
const OBSTACLE_H = 30
const COIN_SIZE = 56
/** Road speed at 1x, in units per second. */
const BASE_SPEED = 240
/** Speed ramps linearly from 1x to RAMP_MAX over RAMP_SECONDS of play, then holds. */
const RAMP_MAX = 2.2
const RAMP_SECONDS = 60
/** Leaves ~200ms to flip between alternating rows even at 2x. */
const ROW_GAP = 190
const FIRST_ROW_Y = -60
const FLIP_SECONDS = 0.1
/** How close (in units) the player and an object must be to touch. */
const HIT_X = 50
const HIT_Y = 32
const DASH_GAP = 60

/** Obstacle lane per row; the coin takes the other lane. */
const PATTERNS: (0 | 1)[][] = [[0, 1], [0, 0, 1], [1, 1, 0], [0, 1, 0, 1], [1, 0], [0, 0, 1, 1], [1, 0, 1]]

interface Thing { lane: 0 | 1; y: number; kind: 'barrier' | 'coin' }

interface World {
  /** Endless: a round only ends on a crash. */
  status: 'ready' | 'playing' | 'crashed'
  lane: 0 | 1
  /** 0 -> 1 through the current flip; 1 when settled. */
  flip: number
  things: Thing[]
  queue: (0 | 1)[]
  untilRow: number
  distance: number
  score: number
  /** Seconds of play, drives the speed ramp. */
  elapsed: number
  pops: Pop[]
  shake: number
  clock: number
}

function createWorld(): World {
  return {
    status: 'ready', lane: 0, flip: 1, things: [], queue: [], untilRow: 0, distance: 0, score: 0,
    elapsed: 0, pops: [], shake: 0, clock: 0,
  }
}

const speedFactor = (world: World) => 1 + (RAMP_MAX - 1) * Math.min(1, world.elapsed / RAMP_SECONDS)

function playerX(world: World): number {
  const from = LANE_X[1 - world.lane]
  const to = LANE_X[world.lane]
  return from + (to - from) * world.flip
}

function spawnRow(world: World, y: number) {
  if (world.queue.length === 0)
    world.queue = [...PATTERNS[Math.floor(Math.random() * PATTERNS.length)]]
  const blocked = world.queue.shift() ?? 0
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

  world.elapsed += dt
  world.flip = Math.min(1, world.flip + dt / FLIP_SECONDS)
  const travel = BASE_SPEED * speedFactor(world) * dt
  world.distance += travel
  for (const thing of world.things)
    thing.y += travel

  world.untilRow -= travel
  while (world.untilRow <= 0) {
    spawnRow(world, FIRST_ROW_Y + world.untilRow)
    world.untilRow += ROW_GAP
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
  const surfaceRef = usePlaySurface()
  const { boardRef, canvasRef, viewRef, onResizeRef } = useCanvasBoard(fillBoard)

  const draw = useCallback(() => {
    const world = worldRef.current
    const canvas = canvasRef.current
    const view = viewRef.current
    const ctx = beginFrame(canvas, view)
    if (!ctx)
      return

    const k = view.width / WORLD_W
    const viewH = view.height / k
    const base = spriteState(world.clock, { facing: 'up' })
    const box = (cx: number, cy: number, w: number, h: number) => [(cx - w / 2) * k, (cy - h / 2) * k, w * k, h * k] as const

    sprites.road(ctx, 0, 0, view.width, view.height, { ...base, variant: world.distance * k })
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
    step(world, dt, view.width ? view.height / (view.width / WORLD_W) : 600)
    if (scoreRef.current)
      scoreRef.current.textContent = String(world.score)
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

  const playAgain = () => {
    resetRound()
    round.clear()
  }

  return (
    <div className="game-shell">
      <div ref={surfaceRef} className="game-surface" onPointerDown={tap}>
        <GameHud label="Coins" scoreRef={scoreRef} />
        <div ref={boardRef} className="game-board">
          <canvas ref={canvasRef} className="game-canvas" />
          {round.phase === 'ready' && <p className="game-hint">Tap to run, tap to flip lanes</p>}
        </div>
      </div>
      {round.phase === 'over' && round.result && (
        <EndPanel reason={round.result.reason} score={round.result.score} best={round.result.best} onPlayAgain={playAgain} />
      )}
    </div>
  )
}

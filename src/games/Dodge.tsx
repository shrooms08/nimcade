import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { play } from '../lib/sound'
import { sprites } from './DodgeSprites'
import {
  COIN_SIZE, createWorld, DASH_GAP, flipWindowMs, LANE_X, OBSTACLE_H, OBSTACLE_W, PLAYER_FROM_BOTTOM,
  PLAYER_SIZE, playerX, ROAD_SHARE, speedFactor, step, unitsTall, WORLD_W,
} from './DodgeWorld'
import type { World } from './DodgeWorld'
import { createCues } from './shared/cues'
import { applyShake, popLook } from './shared/effects'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { spriteState } from './shared/sprites'
import { beginFrame, fillBoard, useCanvasBoard } from './shared/useCanvasBoard'
import { useGameLoop } from './shared/useGameLoop'
import { useRound } from './shared/useRound'
import type { GameProps } from './types'

export const DODGE_ID = 'dodge'

export default function Dodge({ active, onScore }: GameProps) {
  const round = useRound(DODGE_ID, active, onScore)
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

  // Dev-only handle for automated play-testing; stripped from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV)
      return
    const host = window as typeof window & { __nimcade?: Record<string, () => unknown> }
    host.__nimcade = { ...host.__nimcade, dodge: () => worldRef.current }
  }, [])

  // Sound only: the score counts collected coins, and the speed text changes on each step up.
  const cuesRef = useRef(createCues({ score: 'coin', crashed: 'fail' }))

  const { start, stop } = useGameLoop((dt) => {
    const world = worldRef.current
    const view = viewRef.current
    step(world, dt, unitsTall(view.width, view.height))
    cuesRef.current.frame({ score: world.score, crashed: world.status === 'crashed' ? 1 : 0 })
    if (scoreRef.current)
      scoreRef.current.textContent = String(world.score)
    const speed = `x${speedFactor(world.elapsed).toFixed(1)}`
    if (speedRef.current && speedRef.current.textContent !== speed) {
      speedRef.current.textContent = speed
      play('tick')
    }
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
    cuesRef.current.reset({ score: 0, crashed: 0 })
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
        console.info(`[Dodge] flip window: 1x ${flipWindowMs(1)}ms, 2x ${flipWindowMs(2)}ms, 3x ${flipWindowMs(3)}ms, 4x ${flipWindowMs(4)}ms`)
      round.begin()
      start()
      return
    }
    if (world.status !== 'playing')
      return
    world.lane = world.lane === 0 ? 1 : 0
    // Flipping mid-flip reverses from where the critter currently is.
    world.flip = 1 - world.flip
    play('tap')
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

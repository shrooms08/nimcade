import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { agePops, applyShake, drawUrgentFlash, FLASH_MS, POP_MS, ROUND_SECONDS, SHAKE_MS } from './shared/effects'
import type { Pop } from './shared/effects'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { spriteState } from './shared/sprites'
import { beginFrame, fillBoard, useCanvasBoard } from './shared/useCanvasBoard'
import { useCountdown } from './shared/useCountdown'
import { useGameLoop } from './shared/useGameLoop'
import { usePlaySurface } from './shared/usePlaySurface'
import { useRound } from './shared/useRound'
import { sprites } from './StackDropSprites'
import type { GameProps } from './types'

export const STACK_DROP_ID = 'stack-drop'

/** Game units: the canvas is always WORLD_W units wide; 1 unit ≈ 1 CSS px on a phone. */
const WORLD_W = 300
const BLOCK_H = 22
const BASE_W = 150
const GROUND_H = 36
const SLIDE_SPEED = 160
const SLIDE_SPEED_STEP = 0.06
const SLIDE_SPEED_MAX = 380
/** How far above the stack a new block hovers. */
const HOVER_GAP = 100
const LOWER_SPEED = 150
const DROP_SPEED = 900
const GRAVITY = 1400
const PERFECT_PX = 3
const PERFECT_RESTORE_PX = 6
const PERFECT_MS = 220

interface Slab { x: number; w: number }
interface Debris extends Slab { bottom: number; vy: number; variant: number }
interface Block extends Slab {
  bottom: number
  dirX: 1 | -1
  falling: boolean
  /** Set when a hold starts on this block, so a leftover release can't drop the next one. */
  pressed: boolean
}

interface World {
  status: 'ready' | 'playing' | 'missed' | 'over'
  stack: Slab[]
  block: Block
  debris: Debris[]
  holding: boolean
  score: number
  timeLeft: number
  camera: number
  pops: Pop[]
  perfect: number
  shake: number
  flash: number
  clock: number
}

const stackTop = (world: World) => world.stack.length * BLOCK_H

function spawnBlock(world: World) {
  const { w } = world.stack[world.stack.length - 1]
  const fromLeft = world.stack.length % 2 === 0
  world.block = { x: fromLeft ? 0 : WORLD_W - w, w, bottom: stackTop(world) + HOVER_GAP, dirX: fromLeft ? 1 : -1, falling: false, pressed: false }
}

function createWorld(): World {
  const world = {
    status: 'ready', stack: [{ x: (WORLD_W - BASE_W) / 2, w: BASE_W }], debris: [], holding: false, score: 0,
    timeLeft: ROUND_SECONDS, camera: 0, pops: [], perfect: 0, shake: 0, flash: 0, clock: 0,
  } as Omit<World, 'block'> as World
  spawnBlock(world)
  return world
}

function lock(world: World) {
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

function step(world: World, dt: number, viewH: number) {
  const ms = dt * 1000
  world.clock += ms
  world.flash = Math.max(0, world.flash - ms)
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

  world.timeLeft = Math.max(0, world.timeLeft - dt)
  const { block } = world
  if (block.falling) {
    block.bottom -= DROP_SPEED * dt
  }
  else {
    const speed = Math.min(SLIDE_SPEED_MAX, SLIDE_SPEED * (1 + SLIDE_SPEED_STEP * world.score))
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
  if (world.status === 'playing' && world.timeLeft <= 0)
    world.status = 'over'
}

export default function StackDrop({ active, onScore }: GameProps) {
  const round = useRound(STACK_DROP_ID, active, onScore)
  const worldRef = useRef<World>(createWorld())
  const scoreRef = useRef<HTMLSpanElement | null>(null)
  const surfaceRef = usePlaySurface()
  const countdown = useCountdown()

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
    const base = spriteState(world.clock)
    // World y grows upward from the ground; screen y grows downward.
    const screenY = (top: number) => (viewH - GROUND_H - (top - world.camera)) * k
    const drawSlab = (slab: Slab, bottom: number, patch = {}) =>
      sprites.block(ctx, slab.x * k, screenY(bottom + BLOCK_H), slab.w * k, BLOCK_H * k, { ...base, ...patch })

    sprites.sky(ctx, 0, 0, view.width, view.height, { ...base, variant: world.camera })
    sprites.ground(ctx, 0, screenY(0), view.width, GROUND_H * k + 2, base)

    const pop = world.pops[world.pops.length - 1]
    world.stack.forEach((slab, level) => {
      const settling = pop && level === world.stack.length - 1
      const scale = settling ? 1 + 0.15 * (1 - Math.min(1, pop.age / POP_MS)) : 1
      drawSlab(slab, level * BLOCK_H, { variant: level, scale })
    })
    if (world.perfect > 0) {
      const top = world.stack[world.stack.length - 1]
      const bottom = (world.stack.length - 1) * BLOCK_H
      sprites.perfect(ctx, top.x * k, screenY(bottom + BLOCK_H), top.w * k, BLOCK_H * k, { ...base, alpha: (0.8 * world.perfect) / PERFECT_MS })
    }
    for (const piece of world.debris)
      drawSlab(piece, piece.bottom, { variant: piece.variant, alpha: 0.85 })
    if (world.status === 'ready' || world.status === 'playing')
      drawSlab(world.block, world.block.bottom, { variant: world.stack.length })

    drawUrgentFlash(ctx, view.width, view.height, world.flash)
    applyShake(canvas, world.shake)
  }, [canvasRef, viewRef])

  useEffect(() => {
    onResizeRef.current = draw
  }, [draw, onResizeRef])

  const { start, stop } = useGameLoop((dt) => {
    const world = worldRef.current
    const view = viewRef.current
    step(world, dt, view.width ? view.height / (view.width / WORLD_W) : 600)
    if (countdown.update(world.timeLeft, world.status === 'playing'))
      world.flash = FLASH_MS
    if (scoreRef.current)
      scoreRef.current.textContent = String(world.score)
    draw()

    if ((world.status === 'missed' && world.shake === 0) || world.status === 'over') {
      round.finish(world.score, world.status === 'missed' ? 'Missed!' : 'Time!')
      return false
    }
    return true
  })

  const resetRound = useCallback(() => {
    stop()
    worldRef.current = createWorld()
    countdown.reset()
    if (scoreRef.current)
      scoreRef.current.textContent = '0'
    draw()
  }, [countdown, draw, stop])

  useEffect(() => {
    resetRound()
    return stop
  }, [active, resetRound, stop])

  const press = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const world = worldRef.current
    if (!active || (world.status !== 'ready' && world.status !== 'playing'))
      return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    catch {
      // Capture is best-effort; release still arrives via pointerup.
    }
    world.holding = true
    if (!world.block.falling)
      world.block.pressed = true
    if (world.status === 'ready') {
      world.status = 'playing'
      round.begin()
      start()
    }
  }

  const release = () => {
    const world = worldRef.current
    world.holding = false
    if (world.status === 'playing' && world.block.pressed && !world.block.falling)
      world.block.falling = true
  }

  const playAgain = () => {
    resetRound()
    round.clear()
  }

  return (
    <div className="game-shell">
      <div ref={surfaceRef} className="game-surface" onPointerDown={press} onPointerUp={release} onPointerCancel={release}>
        <GameHud label="Blocks" scoreRef={scoreRef} countdownRef={countdown.countdownRef} />
        <div ref={boardRef} className="game-board">
          <canvas ref={canvasRef} className="game-canvas" />
          {round.phase === 'ready' && <p className="game-hint">Hold to lower, release to drop</p>}
        </div>
      </div>
      {round.phase === 'over' && round.result && (
        <EndPanel title={round.result.title} score={round.result.score} best={round.result.best} onPlayAgain={playAgain} />
      )}
    </div>
  )
}

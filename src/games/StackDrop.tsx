import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { applyShake, POP_MS } from './shared/effects'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { spriteState } from './shared/sprites'
import { beginFrame, fillBoard, useCanvasBoard } from './shared/useCanvasBoard'
import { useGameLoop } from './shared/useGameLoop'
import { usePlaySurface } from './shared/usePlaySurface'
import { useRound } from './shared/useRound'
import { sprites } from './StackDropSprites'
import { BLOCK_H, createWorld, GROUND_H, PERFECT_MS, step, WORLD_W } from './StackDropWorld'
import type { Slab, World } from './StackDropWorld'
import type { GameProps } from './types'

export const STACK_DROP_ID = 'stack-drop'

export default function StackDrop({ active, onScore }: GameProps) {
  const round = useRound(STACK_DROP_ID, active, onScore)
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

    if (world.status === 'missed' && world.shake === 0) {
      round.finish(world.score, 'Missed!')
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
        <GameHud label="Blocks" scoreRef={scoreRef} />
        <div ref={boardRef} className="game-board">
          <canvas ref={canvasRef} className="game-canvas" />
          {round.phase === 'ready' && <p className="game-hint">Hold to lower, release to drop</p>}
        </div>
      </div>
      {round.phase === 'over' && round.result && (
        <EndPanel reason={round.result.reason} score={round.result.score} best={round.result.best} onPlayAgain={playAgain} />
      )}
    </div>
  )
}

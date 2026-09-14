import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { readBest } from '../lib/scores'
import { applyShake } from './shared/effects'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { beginFrame, fillBoard, useCanvasBoard } from './shared/useCanvasBoard'
import { useGameLoop } from './shared/useGameLoop'
import { usePlaySurface } from './shared/usePlaySurface'
import { useRound } from './shared/useRound'
import { drawTowerUp, unitsTall } from './TowerUpRender'
import { createWorld, pressLoad, releaseLoad, step, tumbleDone } from './TowerUpWorld'
import type { World } from './TowerUpWorld'
import type { GameProps } from './types'

export const TOWER_UP_ID = 'tower-up'

export default function TowerUp({ active, onScore }: GameProps) {
  const round = useRound(TOWER_UP_ID, active, onScore)
  const worldRef = useRef<World>(createWorld())
  const floorsRef = useRef<HTMLSpanElement | null>(null)
  const bestRef = useRef<HTMLSpanElement | null>(null)
  const bestAtStartRef = useRef(0)
  const surfaceRef = usePlaySurface()
  const { boardRef, canvasRef, viewRef, onResizeRef } = useCanvasBoard(fillBoard)

  const draw = useCallback(() => {
    const ctx = beginFrame(canvasRef.current, viewRef.current)
    if (!ctx)
      return
    drawTowerUp(ctx, viewRef.current, worldRef.current)
    applyShake(canvasRef.current, worldRef.current.shake)
  }, [canvasRef, viewRef])

  useEffect(() => {
    onResizeRef.current = draw
  }, [draw, onResizeRef])

  // Dev-only handle for automated play-testing; stripped from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV)
      return
    const host = window as typeof window & { __nimcade?: Record<string, () => unknown> }
    host.__nimcade = { ...host.__nimcade, towerUp: () => worldRef.current }
  }, [])

  const updateHud = useCallback(() => {
    const world = worldRef.current
    if (floorsRef.current)
      floorsRef.current.textContent = String(world.floors)
    if (bestRef.current)
      bestRef.current.textContent = String(Math.max(bestAtStartRef.current, world.score))
  }, [])

  const { start, stop } = useGameLoop((dt) => {
    const world = worldRef.current
    step(world, dt, unitsTall(viewRef.current))
    updateHud()
    draw()
    // Endless: the only way out is a complete miss, once the floor has tumbled away.
    if (tumbleDone(world)) {
      round.finish(world.score, 'Missed!')
      return false
    }
    return true
  })

  const resetRound = useCallback(() => {
    stop()
    worldRef.current = createWorld()
    bestAtStartRef.current = readBest(TOWER_UP_ID)
    updateHud()
    draw()
  }, [draw, stop, updateHud])

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
    pressLoad(world)
    if (world.status === 'ready') {
      world.status = 'playing'
      round.begin()
      start()
    }
  }

  const release = () => releaseLoad(worldRef.current)

  const playAgain = () => {
    resetRound()
    round.clear()
  }

  return (
    <div className="game-shell">
      <div ref={surfaceRef} className="game-surface" onPointerDown={press} onPointerUp={release} onPointerCancel={release}>
        <GameHud label="Floors" scoreRef={floorsRef} secondaryLabel="Best" secondaryRef={bestRef} secondaryInitial="0" />
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

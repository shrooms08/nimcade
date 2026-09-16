import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { readBest } from '../lib/scores'
import { play } from '../lib/sound'
import { applyShake } from './shared/effects'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { PreRoll } from './shared/PreRoll'
import { beginFrame, fillBoard, useCanvasBoard } from './shared/useCanvasBoard'
import { useGameLoop } from './shared/useGameLoop'
import { usePreRoll } from './shared/usePreRoll'
import { useRound } from './shared/useRound'
import { drawBuildUp, unitsTall } from './BuildUpRender'
import { createWorld, pressLoad, releaseLoad, step, tumbleDone } from './BuildUpWorld'
import type { World } from './BuildUpWorld'
import type { GameProps } from './types'

export const BUILD_UP_ID = 'build-up'

export default function BuildUp({ active, onScore }: GameProps) {
  const round = useRound(BUILD_UP_ID, active, onScore)
  const worldRef = useRef<World>(createWorld())
  const floorsRef = useRef<HTMLSpanElement | null>(null)
  const bestRef = useRef<HTMLSpanElement | null>(null)
  const bestAtStartRef = useRef(0)
  const { boardRef, canvasRef, viewRef, onResizeRef } = useCanvasBoard(fillBoard)
  // 3-2-1-GO before the crane starts moving; presses meanwhile are ignored.
  const { label: preRollLabel, start: startPreRoll, cancel: cancelPreRoll } = usePreRoll(() => {
    if (worldRef.current.status === 'countdown')
      worldRef.current.status = 'playing'
  })

  const draw = useCallback(() => {
    const ctx = beginFrame(canvasRef.current, viewRef.current)
    if (!ctx)
      return
    drawBuildUp(ctx, viewRef.current, worldRef.current)
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
    host.__nimcade = { ...host.__nimcade, buildUp: () => worldRef.current }
  }, [])

  const updateHud = useCallback(() => {
    const world = worldRef.current
    if (floorsRef.current)
      floorsRef.current.textContent = String(world.floors)
    if (bestRef.current)
      bestRef.current.textContent = String(Math.max(bestAtStartRef.current, world.score))
  }, [])

  // Sound only: a locked floor bumps `floors`, and a perfect one also bumps `perfectStreak`.
  const cuesRef = useRef({ floors: 0, streak: 0, missed: false })

  const { start, stop } = useGameLoop((dt) => {
    const world = worldRef.current
    step(world, dt, unitsTall(viewRef.current))
    const cues = cuesRef.current
    if (world.floors > cues.floors)
      play(world.perfectStreak > cues.streak ? 'perfect' : 'score')
    if (world.status === 'missed' && !cues.missed)
      play('fail')
    cuesRef.current = { floors: world.floors, streak: world.perfectStreak, missed: world.status === 'missed' }
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
    cancelPreRoll()
    worldRef.current = createWorld()
    cuesRef.current = { floors: worldRef.current.floors, streak: 0, missed: false }
    bestAtStartRef.current = readBest(BUILD_UP_ID)
    updateHud()
    draw()
  }, [cancelPreRoll, draw, stop, updateHud])

  useEffect(() => {
    resetRound()
    return stop
  }, [active, resetRound, stop])

  const press = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const world = worldRef.current
    if (!active)
      return
    if (world.status === 'ready') {
      world.status = 'countdown'
      round.begin()
      start()
      startPreRoll()
      return
    }
    if (world.status !== 'playing')
      return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    catch {
      // Capture is best-effort; release still arrives via pointerup.
    }
    pressLoad(world)
  }

  const release = () => {
    const dropping = worldRef.current.status === 'playing' && !worldRef.current.load.falling
    releaseLoad(worldRef.current)
    if (dropping && worldRef.current.load.falling)
      play('tap')
  }

  return (
    <div className="game-shell">
      <div className="game-surface" onPointerDown={press} onPointerUp={release} onPointerCancel={release}>
        <GameHud label="Floors" scoreRef={floorsRef} secondaryLabel="Best" secondaryRef={bestRef} secondaryInitial="0" />
        <div ref={boardRef} className="game-board">
          <canvas ref={canvasRef} className="game-canvas" />
          <PreRoll label={preRollLabel} />
          {round.phase === 'ready' && <p className="game-hint">Hold to lower, release to drop</p>}
        </div>
      </div>
      {round.phase === 'over' && round.result && (
        <EndPanel reason={round.result.reason} score={round.result.score} best={round.result.best} />
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { applyShake } from './shared/effects'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { beginFrame, useCanvasBoard } from './shared/useCanvasBoard'
import type { Fit } from './shared/useCanvasBoard'
import { useGameLoop } from './shared/useGameLoop'
import { usePlaySurface } from './shared/usePlaySurface'
import { useRound } from './shared/useRound'
import { createRenderer } from './TheVoidRender'
import {
  AREA_H, AREA_W, crashDone, createWorld, GATES_PER_STAGE, inBoostButton, setBoost, setTarget, step, unitsToPlane,
} from './TheVoidWorld'
import type { World } from './TheVoidWorld'
import type { GameProps } from './types'

export const THE_VOID_ID = 'the-void'

/** The largest 3:4 box that fits the board. */
const fitArea: Fit = (width, height) => {
  const w = Math.floor(Math.min(width, (height * AREA_W) / AREA_H))
  return { width: w, height: Math.floor((w * AREA_H) / AREA_W) }
}

export default function TheVoid({ active, onScore }: GameProps) {
  const round = useRound(THE_VOID_ID, active, onScore)
  const [renderer] = useState(createRenderer)
  const worldRef = useRef<World>(createWorld())
  const scoreRef = useRef<HTMLSpanElement | null>(null)
  const stageRef = useRef<HTMLSpanElement | null>(null)
  const gateRef = useRef<HTMLSpanElement | null>(null)
  const passesRef = useRef(0)
  const steerPointerRef = useRef<number | null>(null)
  const boostPointerRef = useRef<number | null>(null)
  const surfaceRef = usePlaySurface()
  const { boardRef, canvasRef, viewRef, onResizeRef } = useCanvasBoard(fitArea)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = beginFrame(canvas, viewRef.current)
    if (!ctx)
      return
    renderer(ctx, viewRef.current, worldRef.current)
    applyShake(canvas, worldRef.current.shake)
  }, [canvasRef, viewRef, renderer])

  useEffect(() => {
    onResizeRef.current = draw
  }, [draw, onResizeRef])

  // Dev-only handle for automated play-testing; stripped from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV)
      return
    const host = window as typeof window & { __nimcade?: Record<string, () => unknown> }
    host.__nimcade = { ...host.__nimcade, theVoid: () => worldRef.current }
  }, [])

  const updateHud = useCallback(() => {
    const world = worldRef.current
    const set = (element: HTMLSpanElement | null, text: string) => {
      if (element && element.textContent !== text)
        element.textContent = text
    }
    set(scoreRef.current, String(world.score))
    set(stageRef.current, String(world.stage))
    set(gateRef.current, `${world.gateInStage}/${GATES_PER_STAGE}`)
    const score = scoreRef.current
    if (world.passes !== passesRef.current && score) {
      passesRef.current = world.passes
      score.classList.remove('is-pop')
      void score.offsetWidth // restart the pop animation
      score.classList.add('is-pop')
    }
  }, [])

  const { start, stop } = useGameLoop((dt) => {
    const world = worldRef.current
    step(world, dt)
    updateHud()
    draw()
    // Endless: the only way out is a hit with no shields left.
    if (crashDone(world)) {
      round.finish(world.score, 'Crashed!')
      return false
    }
    return true
  })

  const resetRound = useCallback(() => {
    stop()
    worldRef.current = createWorld()
    passesRef.current = 0
    steerPointerRef.current = null
    boostPointerRef.current = null
    updateHud()
    draw()
  }, [draw, stop, updateHud])

  useEffect(() => {
    resetRound()
    return stop
  }, [active, resetRound, stop])

  /** Pointer position in game units, relative to the canvas (may fall outside it). */
  const toUnits = (event: ReactPointerEvent): [number, number] | null => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0)
      return null
    return [((event.clientX - rect.left) / rect.width) * AREA_W, ((event.clientY - rect.top) / rect.height) * AREA_H]
  }

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const world = worldRef.current
    const at = toUnits(event)
    if (!active || !at || world.status === 'crashed')
      return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    catch {
      // Capture is best-effort; moves and releases still arrive while over the surface.
    }
    if (inBoostButton(...at)) {
      boostPointerRef.current = event.pointerId
      setBoost(world, true)
    }
    else {
      steerPointerRef.current = event.pointerId
      setTarget(world, ...unitsToPlane(...at))
    }
    if (world.status === 'ready') {
      world.status = 'playing'
      round.begin()
      start()
    }
  }

  const move = (event: ReactPointerEvent) => {
    if (event.pointerId !== steerPointerRef.current)
      return
    const at = toUnits(event)
    if (at)
      setTarget(worldRef.current, ...unitsToPlane(...at))
  }

  const up = (event: ReactPointerEvent) => {
    if (event.pointerId === boostPointerRef.current) {
      boostPointerRef.current = null
      setBoost(worldRef.current, false)
    }
    if (event.pointerId === steerPointerRef.current)
      steerPointerRef.current = null
  }

  const playAgain = () => {
    resetRound()
    round.clear()
  }

  return (
    <div className="game-shell">
      <div
        ref={surfaceRef}
        className="game-surface"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <GameHud
          label="Score"
          scoreRef={scoreRef}
          secondaryLabel="Stage"
          secondaryRef={stageRef}
          secondaryInitial="1"
          tertiaryLabel="Gate"
          tertiaryRef={gateRef}
          tertiaryInitial={`0/${GATES_PER_STAGE}`}
        />
        <div ref={boardRef} className="game-board">
          <canvas ref={canvasRef} className="game-canvas" />
          {round.phase === 'ready' && <p className="game-hint">Drag to steer · hold BOOST</p>}
        </div>
      </div>
      {round.phase === 'over' && round.result && (
        <EndPanel reason={round.result.reason} score={round.result.score} best={round.result.best} onPlayAgain={playAgain} />
      )}
    </div>
  )
}

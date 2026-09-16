import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { setBoostHum } from '../lib/sound'
import { createCues } from './shared/cues'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { LoadingMark } from './shared/LoadingMark'
import { PreRoll } from './shared/PreRoll'
import { useGameLoop } from './shared/useGameLoop'
import { usePreRoll } from './shared/usePreRoll'
import { useRound } from './shared/useRound'
import type { VoidRenderer } from './VoidRunRender'
import {
  AREA_H, AREA_W, BOOST_BAR, BOOST_BUTTON, crashDone, createWorld, GATES_PER_STAGE, inBoostButton, isBoosting,
  MAX_SHIELDS, MOUTH_HALF, MOUTH_Y, setBoost, setTarget, START_SHIELDS, step, unitsToPlane,
} from './VoidRunWorld'
import type { World } from './VoidRunWorld'
import type { GameProps } from './types'
import './VoidRun.css'

export const VOID_RUN_ID = 'void-run'

/** The Three.js renderer lives in its own lazily loaded chunk; repeat calls share one request. */
const loadRenderer = () => import('./VoidRunRender')

/** A position or size in game units as a percentage of the play area. */
const x = (units: number) => `${(units / AREA_W) * 100}%`
const y = (units: number) => `${(units / AREA_H) * 100}%`

function scrollParent(element: HTMLElement): Element | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY))
      return parent
  }
  return null
}

export default function VoidRun({ active, visible = false, onScore }: GameProps) {
  // The 3D scene stays up while the card is on screen, so browse mode shows a live preview.
  const sceneLive = active || visible
  const round = useRound(VOID_RUN_ID, active, onScore)
  const worldRef = useRef<World>(createWorld())
  const [renderer, setRenderer] = useState<VoidRenderer | null>(null)
  const rendererRef = useRef<VoidRenderer | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const scoreRef = useRef<HTMLSpanElement | null>(null)
  const stageNumberRef = useRef<HTMLSpanElement | null>(null)
  const gateRef = useRef<HTMLSpanElement | null>(null)
  const multRef = useRef<HTMLSpanElement | null>(null)
  const shieldsRef = useRef<HTMLSpanElement | null>(null)
  const boostRef = useRef<HTMLDivElement | null>(null)
  const boostFillRef = useRef<HTMLDivElement | null>(null)
  const bannerRef = useRef<HTMLParagraphElement | null>(null)
  const hudRef = useRef({ passes: 0, mult: 0, shields: -1, boosting: false, bannerStage: 0 })
  const steerPointerRef = useRef<number | null>(null)
  const boostPointerRef = useRef<number | null>(null)
  // 3-2-1-GO before the gates come; until then input only positions the ball.
  const { label: preRollLabel, start: startPreRoll, cancel: cancelPreRoll } = usePreRoll(() => {
    if (worldRef.current.status === 'countdown')
      worldRef.current.status = 'playing'
  })

  useEffect(() => {
    rendererRef.current = renderer
  }, [renderer])

  // Keep the play area the largest 3:4 box that fits the board.
  useEffect(() => {
    const board = boardRef.current, stage = stageRef.current
    if (!board || !stage)
      return
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.floor(Math.min(entry.contentRect.width, (entry.contentRect.height * AREA_W) / AREA_H))
      stage.style.width = `${w}px`
      stage.style.height = `${Math.floor((w * AREA_H) / AREA_W)}px`
    })
    observer.observe(board)
    return () => observer.disconnect()
  }, [])

  // Fetch the renderer chunk once the card is within one screen of the viewport.
  useEffect(() => {
    const shell = shellRef.current
    if (!shell)
      return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        void loadRenderer()
        observer.disconnect()
      }
    }, { root: scrollParent(shell), rootMargin: '100% 0px' })
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  // A WebGL context only exists while the card is on screen.
  useEffect(() => {
    if (!sceneLive)
      return
    let cancelled = false
    let instance: VoidRenderer | null = null
    loadRenderer()
      .then(({ createVoidRenderer }) => {
        if (cancelled || !sceneRef.current)
          return
        instance = createVoidRenderer(sceneRef.current)
        instance.render(worldRef.current)
        setRenderer(instance)
      })
      .catch(() => {
        // The shimmer stays up; the round still plays.
      })
    return () => {
      cancelled = true
      instance?.dispose()
      setRenderer(null)
    }
  }, [sceneLive])

  // Dev-only handles for automated play-testing; stripped from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV)
      return
    const host = window as typeof window & { __nimcade?: Record<string, () => unknown> }
    host.__nimcade = { ...host.__nimcade, voidRun: () => worldRef.current, voidRunRenderer: () => rendererRef.current?.stats() ?? null }
  }, [])

  const updateHud = useCallback(() => {
    const world = worldRef.current, last = hudRef.current
    const text = (element: HTMLElement | null, value: string) => {
      if (element && element.textContent !== value)
        element.textContent = value
    }
    const pop = (element: HTMLElement | null) => {
      element?.classList.remove('is-pop')
      void element?.offsetWidth // restart the animation
      element?.classList.add('is-pop')
    }
    text(scoreRef.current, String(world.score))
    text(stageNumberRef.current, String(world.stage))
    text(gateRef.current, `${world.gateInStage}/${GATES_PER_STAGE}`)
    text(multRef.current, `x${(world.mult10 / 10).toFixed(1)}`)
    if (world.passes !== last.passes) {
      last.passes = world.passes
      pop(scoreRef.current)
      pop(multRef.current)
    }
    if (world.shields !== last.shields && shieldsRef.current) {
      last.shields = world.shields
      const slots = Math.max(START_SHIELDS, world.shields)
      Array.from(shieldsRef.current.children).forEach((pip, i) => {
        ;(pip as HTMLElement).hidden = i >= slots
        pip.classList.toggle('is-full', i < world.shields)
      })
    }
    const boosting = isBoosting(world)
    if (boosting !== last.boosting) {
      last.boosting = boosting
      boostRef.current?.classList.toggle('is-on', boosting)
      // Covers both ends of the hold: the finger lifting, and the energy running out.
      setBoostHum(boosting)
    }
    if (boostFillRef.current)
      boostFillRef.current.style.transform = `scaleX(${world.boostEnergy})`
    const banner = bannerRef.current
    if (banner && world.banner > 0 && world.bannerStage !== last.bannerStage) {
      last.bannerStage = world.bannerStage
      banner.textContent = `STAGE ${world.bannerStage} CLEAR`
      banner.hidden = false // re-showing restarts the fade in/out
    }
    else if (banner && world.banner === 0 && !banner.hidden) {
      banner.hidden = true
    }
  }, [])

  // Sound only: gates passed and stages cleared are already counted on the world.
  const cuesRef = useRef(createCues({ passes: 'score', stage: 'wave', crashed: 'fail' }))

  const { start, stop } = useGameLoop((dt) => {
    const world = worldRef.current
    step(world, dt)
    // A crash also ends the boost, which stops the hum through updateHud below.
    cuesRef.current.frame({ passes: world.passes, stage: world.stage, crashed: world.status === 'crashed' ? 1 : 0 })
    updateHud()
    rendererRef.current?.render(world)
    // Endless: the only way out is a hit with no shields left.
    if (crashDone(world)) {
      round.finish(world.score, 'Crashed!')
      return false
    }
    return true
  })

  const resetRound = useCallback(() => {
    stop()
    cancelPreRoll()
    worldRef.current = createWorld()
    hudRef.current = { passes: 0, mult: 0, shields: -1, boosting: false, bannerStage: 0 }
    cuesRef.current.reset({ passes: 0, stage: worldRef.current.stage, crashed: 0 })
    setBoostHum(false)
    steerPointerRef.current = null
    boostPointerRef.current = null
    updateHud()
    rendererRef.current?.render(worldRef.current)
  }, [cancelPreRoll, stop, updateHud])

  useEffect(() => {
    resetRound()
    return stop
  }, [active, resetRound, stop])

  /** Pointer position in game units relative to the play area (may fall outside it). */
  const toUnits = (event: ReactPointerEvent): [number, number] | null => {
    const rect = stageRef.current?.getBoundingClientRect()
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
    if (!inBoostButton(...at)) {
      steerPointerRef.current = event.pointerId
      setTarget(world, ...unitsToPlane(...at))
    }
    else if (world.status === 'playing') {
      boostPointerRef.current = event.pointerId
      setBoost(world, true)
    }
    if (world.status === 'ready') {
      world.status = 'countdown'
      round.begin()
      start()
      startPreRoll()
    }
  }

  const move = (event: ReactPointerEvent) => {
    const at = event.pointerId === steerPointerRef.current ? toUnits(event) : null
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

  const { x: bx, y: by, r } = BOOST_BUTTON
  return (
    <div ref={shellRef} className="game-shell">
      <div className="game-surface" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <GameHud
          label="Score" scoreRef={scoreRef}
          secondaryLabel="Stage" secondaryRef={stageNumberRef} secondaryInitial="1"
          tertiaryLabel="Gate" tertiaryRef={gateRef} tertiaryInitial={`0/${GATES_PER_STAGE}`}
        />
        <div ref={boardRef} className="game-board">
          <div ref={stageRef} className="void-stage">
            <div ref={sceneRef} className="void-scene" />
            <span ref={multRef} className="void-mult" style={{ left: x(9), top: y(9) }}>x1.0</span>
            <span ref={shieldsRef} className="void-shields" style={{ right: x(10), top: y(10) }}>
              {Array.from({ length: MAX_SHIELDS }, (_, i) => <span key={i} className="void-pip" />)}
            </span>
            <div ref={boostRef} className="void-boost" style={{ left: x(bx - r), top: y(by - r), width: x(r * 2), height: y(r * 2) }}>BOOST</div>
            <div className="void-boost-bar" style={{ left: x(BOOST_BAR.x), top: y(BOOST_BAR.y), width: x(BOOST_BAR.w), height: y(BOOST_BAR.h) }}>
              <div ref={boostFillRef} className="void-boost-fill" />
            </div>
            <p ref={bannerRef} className="void-banner" style={{ top: y(MOUTH_Y) }} hidden />
            <PreRoll label={preRollLabel} />
            {round.phase === 'ready' && <p className="game-hint void-hint" style={{ top: y(MOUTH_Y + MOUTH_HALF + 12) }}>Drag to steer · hold BOOST</p>}
            {sceneLive && !renderer && <LoadingMark />}
          </div>
        </div>
      </div>
      {round.phase === 'over' && round.result && (
        <EndPanel reason={round.result.reason} score={round.result.score} best={round.result.best} />
      )}
    </div>
  )
}

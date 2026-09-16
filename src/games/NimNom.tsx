import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { play } from '../lib/sound'
import { createCues } from './shared/cues'
import { isActive } from './NimNomChasers'
import { COLS, ROWS } from './NimNomLayouts'
import { position } from './NimNomMovers'
import { chaserLook, createWorld, step, WAVE_FLASH_MS } from './NimNomWorld'
import type { World } from './NimNomWorld'
import { palette, sprites } from './NimNomSprites'
import { applyShake, drawTint, popLook } from './shared/effects'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { spriteState } from './shared/sprites'
import type { Dir } from './shared/sprites'
import { beginFrame, useCanvasBoard } from './shared/useCanvasBoard'
import type { Fit } from './shared/useCanvasBoard'
import { useGameLoop } from './shared/useGameLoop'
import { useRound } from './shared/useRound'
import type { GameProps } from './types'

export const NIMNOM_ID = 'nimnom'

const PAD: { dir: Dir; label: string; path: string }[] = [
  { dir: 'up', label: 'Up', path: 'M6 15l6-6 6 6' },
  { dir: 'left', label: 'Left', path: 'M15 6l-6 6 6 6' },
  { dir: 'down', label: 'Down', path: 'M6 9l6 6 6-6' },
  { dir: 'right', label: 'Right', path: 'M9 6l6 6-6 6' },
]

/** Whole tiles only, so walls stay pixel-crisp. */
const fitMaze: Fit = (width, height) => {
  const tile = Math.max(1, Math.floor(Math.min(width / COLS, height / ROWS)))
  return { width: COLS * tile, height: ROWS * tile }
}

export default function NimNom({ active, onScore }: GameProps) {
  const round = useRound(NIMNOM_ID, active, onScore)
  const worldRef = useRef<World>(createWorld())
  const scoreRef = useRef<HTMLSpanElement | null>(null)
  const waveRef = useRef<HTMLSpanElement | null>(null)
  const bannerRef = useRef<HTMLParagraphElement | null>(null)

  const { boardRef, canvasRef, viewRef, onResizeRef } = useCanvasBoard(fitMaze)

  const draw = useCallback(() => {
    const world = worldRef.current
    const canvas = canvasRef.current
    const view = viewRef.current
    const ctx = beginFrame(canvas, view)
    if (!ctx)
      return

    const tile = view.width / COLS
    const base = spriteState(world.clock, { facing: world.facing })
    ctx.fillStyle = palette.floor
    ctx.fillRect(0, 0, view.width, view.height)

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const index = row * COLS + col
        if (world.layout.walls[index])
          sprites.wall(ctx, col * tile, row * tile, tile, tile, base)
        else if (world.dots[index])
          sprites.dot(ctx, col * tile, row * tile, tile, tile, base)
        else if (world.coins[index])
          sprites.coin(ctx, col * tile, row * tile, tile, tile, base)
      }
    }
    for (const pop of world.pops) {
      const sprite = pop.kind === 'dot' ? sprites.dot : pop.kind === 'coin' ? sprites.coin : sprites.chaser
      sprite(ctx, pop.x * tile, pop.y * tile, tile, tile, { ...base, ...popLook(pop.age), variant: pop.variant })
    }

    const [px, py] = position(world.player)
    sprites.player(ctx, px * tile, py * tile, tile, tile, base)
    for (const chaser of world.chasers) {
      if (!isActive(chaser))
        continue // eaten: off the board until it respawns
      const [cx, cy] = position(chaser)
      sprites.chaser(ctx, cx * tile, cy * tile, tile, tile, { ...base, variant: chaserLook(world, chaser) })
    }

    drawTint(ctx, view.width, view.height, '255, 255, 255', (0.85 * world.waveFlash) / WAVE_FLASH_MS)
    applyShake(canvas, world.shake)
  }, [canvasRef, viewRef])

  useEffect(() => {
    onResizeRef.current = draw
  }, [draw, onResizeRef])

  const updateHud = useCallback(() => {
    const world = worldRef.current
    if (scoreRef.current)
      scoreRef.current.textContent = String(world.score)
    if (waveRef.current)
      waveRef.current.textContent = String(world.wave)
    const banner = bannerRef.current
    if (banner) {
      const text = `WAVE ${world.wave}`
      if (world.banner > 0 && (banner.hidden || banner.textContent !== text)) {
        banner.textContent = text
        banner.hidden = false
      }
      else if (world.banner === 0 && !banner.hidden) {
        banner.hidden = true
      }
    }
  }, [])

  // Sound only: the world reports through its counters, so no game logic changes for cues.
  const cuesRef = useRef(createCues({ eaten: 'eat', spooked: 'power', chain: 'eat-chaser', wave: 'wave', caught: 'fail' }))

  const { start, stop } = useGameLoop((dt) => {
    const world = worldRef.current
    step(world, dt)
    // Dots left counts down, so negate it: eating one is the counter going up.
    cuesRef.current.frame({ eaten: -world.dotsLeft, spooked: world.spookedMs > 0 ? 1 : 0, chain: world.chain, wave: world.wave, caught: world.status === 'caught' ? 1 : 0 })
    updateHud()
    draw()

    // Endless: the only way out is capture, once the shake has played.
    if (world.status === 'caught' && world.shake === 0) {
      round.finish(world.score, 'Caught!')
      return false
    }
    return true
  })

  const resetRound = useCallback(() => {
    stop()
    worldRef.current = createWorld()
    const world = worldRef.current
    cuesRef.current.reset({ eaten: -world.dotsLeft, spooked: 0, chain: world.chain, wave: world.wave, caught: 0 })
    updateHud()
    draw()
  }, [draw, stop, updateHud])

  // Pause and fully reset whenever `active` flips; a fresh round waits for
  // the first d-pad press so no chaser moves unseen.
  useEffect(() => {
    resetRound()
    return stop
  }, [active, resetRound, stop])

  const press = (dir: Dir, event: ReactPointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const world = worldRef.current
    if (!active || world.status === 'caught')
      return
    world.queued = dir
    play('tap')
    if (world.status === 'ready') {
      world.status = 'playing'
      round.begin()
      start()
    }
  }


  return (
    <div className="game-shell">
      <div className="game-surface">
        <GameHud label="Score" scoreRef={scoreRef} secondaryLabel="Wave" secondaryRef={waveRef} secondaryInitial="1" />

        <div ref={boardRef} className="game-board">
          <canvas ref={canvasRef} className="game-canvas" />
          <p ref={bannerRef} className="game-banner" hidden />
          {round.phase === 'ready' && <p className="game-hint">Tap an arrow to start</p>}
        </div>

        <div className="nimnom__pad">
          {PAD.map(({ dir, label, path }) => (
            <button
              key={dir}
              type="button"
              className={`nimnom__key nimnom__key--${dir}`}
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

      {round.phase === 'over' && round.result && (
        <EndPanel
          reason={round.result.reason}
          score={round.result.score}
          best={round.result.best}
        />
      )}
    </div>
  )
}

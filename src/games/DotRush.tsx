import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { COLS, createWorld, position, ROWS, step, WALLS, WAVE_FLASH_MS } from './DotRushWorld'
import type { World } from './DotRushWorld'
import { palette, sprites } from './DotRushSprites'
import { applyShake, drawTint, drawUrgentFlash, FLASH_MS, popLook } from './shared/effects'
import { EndPanel } from './shared/EndPanel'
import { GameHud } from './shared/GameHud'
import { spriteState } from './shared/sprites'
import type { Dir } from './shared/sprites'
import { beginFrame, useCanvasBoard } from './shared/useCanvasBoard'
import type { Fit } from './shared/useCanvasBoard'
import { useCountdown } from './shared/useCountdown'
import { useGameLoop } from './shared/useGameLoop'
import { usePlaySurface } from './shared/usePlaySurface'
import { useRound } from './shared/useRound'
import type { GameProps } from './types'

export const DOT_RUSH_ID = 'dot-rush'

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

export default function DotRush({ active, onScore }: GameProps) {
  const round = useRound(DOT_RUSH_ID, active, onScore)
  const worldRef = useRef<World>(createWorld())
  const scoreRef = useRef<HTMLSpanElement | null>(null)
  const bannerRef = useRef<HTMLParagraphElement | null>(null)
  const surfaceRef = usePlaySurface()
  const countdown = useCountdown()

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
        if (WALLS[index])
          sprites.wall(ctx, col * tile, row * tile, tile, tile, base)
        else if (world.dots[index])
          sprites.dot(ctx, col * tile, row * tile, tile, tile, base)
      }
    }
    for (const pop of world.pops)
      sprites.dot(ctx, pop.x * tile, pop.y * tile, tile, tile, { ...base, ...popLook(pop.age) })

    const [px, py] = position(world.player)
    sprites.player(ctx, px * tile, py * tile, tile, tile, base)
    const [cx, cy] = position(world.chaser)
    sprites.chaser(ctx, cx * tile, cy * tile, tile, tile, base)

    drawUrgentFlash(ctx, view.width, view.height, world.flash)
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

  const { start, stop } = useGameLoop((dt) => {
    const world = worldRef.current
    step(world, dt)
    if (countdown.update(world.timeLeft, world.status === 'playing'))
      world.flash = FLASH_MS
    updateHud()
    draw()

    const caughtAndSettled = world.status === 'caught' && world.shake === 0
    if (caughtAndSettled || world.status === 'over') {
      round.finish(world.score, world.status === 'caught' ? 'Caught!' : 'Time!')
      return false
    }
    return true
  })

  const resetRound = useCallback(() => {
    stop()
    worldRef.current = createWorld()
    countdown.reset()
    updateHud()
    draw()
  }, [countdown, draw, stop, updateHud])

  // Pause and fully reset whenever `active` flips; a fresh round waits for
  // the first d-pad press so the timer never runs unseen.
  useEffect(() => {
    resetRound()
    return stop
  }, [active, resetRound, stop])

  const press = (dir: Dir, event: ReactPointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const world = worldRef.current
    if (!active || world.status === 'caught' || world.status === 'over')
      return
    world.queued = dir
    if (world.status === 'ready') {
      world.status = 'playing'
      round.begin()
      start()
    }
  }

  const playAgain = () => {
    resetRound()
    round.clear()
  }

  return (
    <div className="game-shell">
      <div ref={surfaceRef} className="game-surface" onPointerDown={event => event.stopPropagation()}>
        <GameHud label="Dots" scoreRef={scoreRef} countdownRef={countdown.countdownRef} />

        <div ref={boardRef} className="game-board">
          <canvas ref={canvasRef} className="game-canvas" />
          <p ref={bannerRef} className="game-banner" hidden />
          {round.phase === 'ready' && <p className="game-hint">Tap an arrow to start</p>}
        </div>

        <div className="dot-rush__pad">
          {PAD.map(({ dir, label, path }) => (
            <button
              key={dir}
              type="button"
              className={`dot-rush__key dot-rush__key--${dir}`}
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
          title={round.result.title}
          score={round.result.score}
          best={round.result.best}
          onPlayAgain={playAgain}
        />
      )}
    </div>
  )
}

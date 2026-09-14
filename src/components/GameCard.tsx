import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { RoundReportContext } from '../games/shared/roundReport'
import type { RoundReport } from '../games/shared/roundReport'
import type { Game } from '../games/types'
import { localStats } from '../lib/localStats'
import { readBest, writeBest } from '../lib/scores'
import { GameOverOverlay } from '../ui/chrome/GameOverOverlay'
import type { GameOverInfo } from '../ui/chrome/GameOverOverlay'
import { CardErrorBoundary } from './CardErrorBoundary'

/** A tap is a press and release within this distance and time; anything else is a swipe. */
const TAP_SLOP_PX = 10
const TAP_MAX_MS = 250

/** Replays a tap on whatever is under (x, y), so the game receives it as its first input. */
function forwardTap(x: number, y: number, pointerType: string) {
  const target = document.elementFromPoint(x, y)
  if (!target)
    return
  const init: PointerEventInit = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 1, pointerType, isPrimary: true, button: 0, buttons: 1 }
  target.dispatchEvent(new PointerEvent('pointerdown', init))
  target.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }))
}

/**
 * One card: the game, a tap catcher in browse mode (swipes scroll the feed,
 * a tap enters play and is forwarded to the game), and the game-over overlay.
 */
export default function GameCard({
  game,
  current,
  playing,
  gameOver,
  onEnterPlay,
  onRoundOver,
  onPlayAgain,
  onTip,
  onCup,
  onNext,
  onReady,
}: {
  game: Game
  /** The card fills the feed. */
  current: boolean
  /** The card is in play mode. */
  playing: boolean
  gameOver: GameOverInfo | null
  onEnterPlay: () => void
  onRoundOver: (info: GameOverInfo) => void
  onPlayAgain: () => void
  onTip: () => void
  onCup: () => void
  onNext: () => void
  onReady?: () => void
}) {
  const [retryKey, setRetryKey] = useState(0)
  const bestRef = useRef(readBest(game.id))
  const lastRoundRef = useRef<{ score: number; previousBest: number } | null>(null)
  const pressRef = useRef<{ id: number; x: number; y: number; at: number; type: string } | null>(null)
  const onRoundOverRef = useRef(onRoundOver)
  const GameComponent = game.component

  useEffect(() => {
    onRoundOverRef.current = onRoundOver
  })

  useEffect(() => {
    if (!onReady)
      return
    const frame = requestAnimationFrame(() => onReady())
    return () => cancelAnimationFrame(frame)
  }, [onReady])

  const handleScore = useCallback((score: number) => {
    const previousBest = bestRef.current
    lastRoundRef.current = { score, previousBest }
    if (score > previousBest) {
      bestRef.current = score
      writeBest(game.id, score)
    }
  }, [game.id])

  const report = useCallback((result: RoundReport) => {
    const previousBest = lastRoundRef.current?.previousBest ?? Math.max(0, result.best)
    localStats.addPlay(game.id)
    onRoundOverRef.current({ reason: result.reason, score: result.score, previousBest, newBest: result.score > 0 && result.score > previousBest })
  }, [game.id])

  const onCatcherDown = (event: ReactPointerEvent) => {
    pressRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), type: event.pointerType }
  }

  const onCatcherUp = (event: ReactPointerEvent) => {
    const press = pressRef.current
    pressRef.current = null
    if (!press || press.id !== event.pointerId || !current)
      return
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    if (moved > TAP_SLOP_PX || performance.now() - press.at > TAP_MAX_MS)
      return
    onEnterPlay()
    // Two frames: the catcher unmounts and the game's reset-on-active effect runs before the tap lands.
    const { clientX, clientY } = event
    requestAnimationFrame(() => requestAnimationFrame(() => forwardTap(clientX, clientY, press.type)))
  }

  return (
    <>
      <div className={playing ? 'nc-card__stage' : 'nc-card__stage is-browsing'}>
        <RoundReportContext.Provider value={report}>
          <CardErrorBoundary key={retryKey} title={game.title} onRetry={() => setRetryKey(key => key + 1)}>
            <GameComponent active={playing} visible={current} onScore={handleScore} />
          </CardErrorBoundary>
        </RoundReportContext.Provider>
      </div>
      {!playing && !gameOver && (
        <div
          className="nc-card__catcher"
          onPointerDown={onCatcherDown}
          onPointerUp={onCatcherUp}
          onPointerCancel={() => { pressRef.current = null }}
          aria-label={`Tap to play ${game.title}`}
        />
      )}
      {gameOver && current && (
        <GameOverOverlay info={gameOver} onPlayAgain={onPlayAgain} onTip={onTip} onCup={onCup} onNext={onNext} />
      )}
    </>
  )
}

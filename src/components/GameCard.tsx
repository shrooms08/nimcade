import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { RoundReportContext } from '../games/shared/roundReport'
import type { RoundReport } from '../games/shared/roundReport'
import type { Game } from '../games/types'
import type { CupEntryState } from '../lib/cupEntry'
import { localStats } from '../lib/localStats'
import { readBest, writeBest } from '../lib/scores'
import { play } from '../lib/sound'
import { GameOverOverlay } from '../ui/chrome/GameOverOverlay'
import type { GameOverInfo } from '../ui/chrome/GameOverOverlay'
import { renderCover } from '../ui/covers'
import { CardErrorBoundary } from './CardErrorBoundary'

/** A tap is a press and release within this distance and time; anything else is a swipe. */
const TAP_SLOP_PX = 10
const TAP_MAX_MS = 250
/** The cover crossfade. Leaving play, the game stays mounted under the returning cover this long. */
const COVER_FADE_MS = 200
/** Give up forwarding the first tap if no game has mounted under the finger by then. */
const FORWARD_MAX_FRAMES = 20

/**
 * Replays a tap on the freshly mounted game under (x, y), so it gets it as its first input.
 * Waits until the game has been under the point for two frames, so its first layout
 * (canvas size, play area) is done when the tap lands.
 */
function forwardTap(stage: HTMLElement | null, x: number, y: number, pointerType: string) {
  let seen = false
  let frames = 0
  function attempt() {
    const target = document.elementFromPoint(x, y)
    if (stage && target && stage.contains(target)) {
      if (seen) {
        const init: PointerEventInit = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 1, pointerType, isPrimary: true, button: 0, buttons: 1 }
        target.dispatchEvent(new PointerEvent('pointerdown', init))
        target.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }))
        return
      }
      seen = true
    }
    if (++frames < FORWARD_MAX_FRAMES)
      requestAnimationFrame(attempt)
  }
  requestAnimationFrame(attempt)
}

/**
 * One card. In browse it shows the game's cover and a tap catcher (swipes scroll the
 * feed, a tap enters play); the game itself is only mounted in play and while its
 * game-over overlay shows its last frame.
 */
export default function GameCard({
  game,
  current,
  near,
  playing,
  gameOver,
  cupEntry,
  onEnterPlay,
  onRoundOver,
  onPlayAgain,
  onTip,
  onCup,
  onNext,
  onReady,
  onConnectWallet,
}: {
  game: Game
  /** The card fills the feed. */
  current: boolean
  /** The card is at most one card away from the current one. */
  near: boolean
  /** The card is in play mode. */
  playing: boolean
  gameOver: GameOverInfo | null
  /** Today's Cup entry for the round on the game over overlay. */
  cupEntry: CupEntryState
  onEnterPlay: () => void
  onRoundOver: (info: GameOverInfo) => void
  onPlayAgain: () => void
  onTip: () => void
  onCup: () => void
  onNext: () => void
  onReady?: () => void
  onConnectWallet: () => void
}) {
  const [retryKey, setRetryKey] = useState(0)
  /** Bumped by Play again: the finished game is still mounted (frozen), so a new round needs a fresh one. */
  const [roundKey, setRoundKey] = useState(0)
  const showGame = playing || gameOver !== null
  const [gameMounted, setGameMounted] = useState(showGame)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const bestRef = useRef(readBest(game.id))
  const lastRoundRef = useRef<{ score: number; previousBest: number } | null>(null)
  const pressRef = useRef<{ id: number; x: number; y: number; at: number; type: string } | null>(null)
  const onRoundOverRef = useRef(onRoundOver)
  /** Set once the finished round is reported, so a remounted end panel (StrictMode in dev) can't report it twice. */
  const reportedRef = useRef(false)
  const GameComponent = game.component

  // Mount as soon as the game is wanted; unmount only once the cover has faded back in.
  if (showGame && !gameMounted)
    setGameMounted(true)

  useEffect(() => {
    if (showGame || !gameMounted)
      return
    const timer = window.setTimeout(() => setGameMounted(false), COVER_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [gameMounted, showGame])

  useEffect(() => {
    if (near)
      void game.preload?.()
  }, [game, near])

  useEffect(() => {
    onRoundOverRef.current = onRoundOver
  })

  // A new round starts in play mode: it may be reported again.
  useEffect(() => {
    if (playing)
      reportedRef.current = false
  }, [playing])

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
    if (reportedRef.current)
      return
    reportedRef.current = true
    const previousBest = lastRoundRef.current?.previousBest ?? Math.max(0, result.best)
    localStats.addPlay(game.id)
    if (result.score > 0 && result.score > previousBest)
      play('new-best')
    // The signed Cup entry for this round is made by App (useCupEntry in src/lib/cupEntry.ts) once onRoundOver lands.
    onRoundOverRef.current({ reason: result.reason, score: result.score, previousBest, newBest: result.score > 0 && result.score > previousBest })
  }, [game.id])

  const onCatcherDown = (event: ReactPointerEvent) => {
    pressRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, type: event.pointerType }
  }

  const onCatcherUp = (event: ReactPointerEvent) => {
    const press = pressRef.current
    pressRef.current = null
    if (!press || press.id !== event.pointerId || !current)
      return
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    // Timed with the events' own timestamps: a main-thread stall between press and release
    // (the first WebGL frame, say) delays the handlers, not the finger.
    if (moved > TAP_SLOP_PX || event.timeStamp - press.at > TAP_MAX_MS)
      return
    onEnterPlay()
    forwardTap(stageRef.current, event.clientX, event.clientY, press.type)
  }

  const playAgain = () => {
    setRoundKey(key => key + 1)
    onPlayAgain()
  }

  return (
    <>
      <div ref={stageRef} className={playing ? 'nc-card__stage' : 'nc-card__stage is-browsing'}>
        {gameMounted && (
          <RoundReportContext.Provider value={report}>
            <CardErrorBoundary key={`${retryKey}:${roundKey}`} title={game.title} onRetry={() => setRetryKey(key => key + 1)}>
              <GameComponent active={showGame} visible={current} onScore={handleScore} />
            </CardErrorBoundary>
          </RoundReportContext.Provider>
        )}
      </div>
      <div className={showGame ? 'nc-card__cover is-hidden' : 'nc-card__cover'} aria-hidden={showGame}>
        {renderCover(game.id, { variant: 'full', howToPlay: game.hint })}
        <span className="nc-card__play-pill">Tap to play</span>
      </div>
      {!showGame && (
        <div
          className="nc-card__catcher"
          onPointerDown={onCatcherDown}
          onPointerUp={onCatcherUp}
          onPointerCancel={() => { pressRef.current = null }}
          aria-label={`Tap to play ${game.title}`}
        />
      )}
      {gameOver && current && (
        <GameOverOverlay info={gameOver} entry={cupEntry} onPlayAgain={playAgain} onTip={onTip} onCup={onCup} onNext={onNext} onConnect={onConnectWallet} />
      )}
    </>
  )
}

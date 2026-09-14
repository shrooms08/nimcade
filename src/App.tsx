import { useCallback, useMemo, useRef, useState } from 'react'
import Feed from './components/Feed'
import type { FeedHandle } from './components/Feed'
import GameCard from './components/GameCard'
import { games } from './games/registry'
import type { Game } from './games/types'
import { localStats } from './lib/localStats'
import { sendTip } from './lib/nimiq'
import { readBest } from './lib/scores'
import type { TipAmount } from './lib/tip'
import { useWallet } from './lib/useWallet'
import { Banners } from './ui/chrome/Banners'
import type { GameOverInfo } from './ui/chrome/GameOverOverlay'
import { InfoCard } from './ui/chrome/InfoCard'
import { NavDock } from './ui/chrome/NavDock'
import type { SheetName } from './ui/chrome/NavDock'
import { HintPill, SwipeHint, TipSuccess, Toast } from './ui/chrome/Overlays'
import { TopChrome } from './ui/chrome/TopChrome'
import { copyText } from './ui/clipboard'
import { chipAddress, makerHandle } from './ui/format'
import { CupSheet } from './ui/sheets/CupSheet'
import { TipSheet } from './ui/sheets/TipSheet'
import { WalletSheet } from './ui/sheets/WalletSheet'
import { Splash } from './ui/Splash'
import { useOnline } from './ui/useOnline'
import { useTransient } from './ui/useTransient'

const HINT_MS = 2200
const TIP_SUCCESS_MS = 1800
const TOAST_MS = 1800

type Mode = 'browse' | 'play'

export default function App() {
  // Nothing wallet-related starts or renders, and no banner, hint, sheet or toast mounts, until the splash has faded out.
  const [splashDone, setSplashDone] = useState(false)
  const wallet = useWallet(splashDone)
  const online = useOnline()
  const feedRef = useRef<FeedHandle | null>(null)
  const indexRef = useRef(0)
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<Mode>('browse')
  const [sheet, setSheet] = useState<SheetName | null>(null)
  const [gameOver, setGameOver] = useState<{ gameId: string; info: GameOverInfo } | null>(null)
  const [firstCardReady, setFirstCardReady] = useState(false)
  /** "Disconnect" forgets the address locally; the SDK has no disconnect call. */
  const [forgotWallet, setForgotWallet] = useState(false)
  const [tipAfterConnect, setTipAfterConnect] = useState(false)
  const [noProviderDismissed, setNoProviderDismissed] = useState(false)
  const [swipeHint, setSwipeHint] = useState(() => !localStats.swipeHintSeen())
  const [statsVersion, setStatsVersion] = useState(0)
  const hint = useTransient<string>()
  const toast = useTransient<string>()
  const tipSuccess = useTransient<{ amount: number; maker: string; hash: string }>()

  const game = games[index]
  const playing = mode === 'play'
  const connected = wallet.status === 'ready' && wallet.address !== null && !forgotWallet
  // "Tip NIM" while disconnected opens the wallet sheet first, then the tip sheet once connected.
  const activeSheet: SheetName | null = sheet === 'wallet' && tipAfterConnect && connected ? 'tip' : sheet

  const stats = useMemo(() => {
    void statsVersion // re-read after a play or a tip
    return { best: readBest(game.id), plays: localStats.plays(game.id), tips: localStats.tips(game.id), tipsSent: localStats.tipsSent() }
  }, [game.id, statsVersion])

  const markReady = useCallback(() => setFirstCardReady(true), [])
  const onSplashExited = useCallback(() => setSplashDone(true), [])

  const dismissSwipeHint = useCallback(() => {
    if (!localStats.swipeHintSeen())
      localStats.markSwipeHintSeen()
    setSwipeHint(false)
  }, [])

  const onCurrentChange = useCallback((next: number) => {
    if (next === indexRef.current)
      return
    indexRef.current = next
    setIndex(next)
    setGameOver(null)
    setMode('browse')
    dismissSwipeHint()
  }, [dismissSwipeHint])

  const enterPlay = (target: Game) => {
    setGameOver(null)
    setSheet(null)
    setMode('play')
    dismissSwipeHint()
    if (!localStats.hintSeen(target.id)) {
      localStats.markHintSeen(target.id)
      hint.show(target.hint, HINT_MS)
    }
  }

  const exitPlay = () => {
    setMode('browse')
    hint.clear()
  }

  // Game over always drops back to browse, so a swipe works straight away.
  const roundOver = (target: Game, info: GameOverInfo) => {
    if (games[indexRef.current]?.id !== target.id)
      return
    setGameOver({ gameId: target.id, info })
    setMode('browse')
    hint.clear()
    setStatsVersion(v => v + 1)
  }

  const openSheet = (name: SheetName) => {
    setMode('browse')
    setSheet(name)
  }

  const closeSheet = () => {
    setSheet(null)
    setTipAfterConnect(false)
  }

  const openTip = () => {
    if (connected) {
      openSheet('tip')
      return
    }
    setTipAfterConnect(true)
    openSheet('wallet')
  }

  const connectWallet = () => {
    if (wallet.status === 'ready')
      setForgotWallet(false)
    else if (wallet.status === 'denied' || wallet.status === 'unavailable')
      wallet.retry()
  }

  const sendTipTo = (target: Game) => async (amount: TipAmount) => {
    const nimiq = await wallet.getProvider()
    if (!nimiq)
      throw new Error('Open Nimcade inside Nimiq Pay to send a tip.')
    return sendTip(nimiq, target.makerAddress, amount)
  }

  const tipSent = (target: Game, amount: TipAmount, hash: string) => {
    localStats.addTip(target.id, amount)
    setStatsVersion(v => v + 1)
    closeSheet()
    tipSuccess.show({ amount, maker: makerHandle(target.maker), hash }, TIP_SUCCESS_MS)
    try {
      navigator.vibrate?.(12)
    }
    catch {
      // Haptics are optional.
    }
  }

  const share = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: `${game.title} on Nimcade`, text: `Play ${game.title} on Nimcade`, url })
      }
      catch {
        // Cancelled share sheet.
      }
      return
    }
    toast.show((await copyText(url)) ? 'Link copied' : "Couldn't copy the link", TOAST_MS)
  }

  const walletLabel = connected && wallet.address ? chipAddress(wallet.address) : 'Connect'

  return (
    <main className="nc-app">
      <Feed
        games={games}
        locked={playing}
        handleRef={feedRef}
        onCurrentChange={onCurrentChange}
        renderCard={(g, i) => (
          <GameCard
            game={g}
            current={i === index}
            playing={playing && i === index}
            gameOver={gameOver?.gameId === g.id ? gameOver.info : null}
            onEnterPlay={() => enterPlay(g)}
            onRoundOver={info => roundOver(g, info)}
            onPlayAgain={() => { setGameOver(null); setMode('play') }}
            onTip={openTip}
            onCup={() => openSheet('cup')}
            onNext={() => feedRef.current?.scrollTo(i + 1)}
            onReady={i === 0 ? markReady : undefined}
          />
        )}
      />

      <TopChrome playing={playing} showWallet={splashDone} walletLabel={walletLabel} onTop={() => openSheet('cup')} onWallet={() => openSheet('wallet')} />
      {splashDone && (
        <Banners
          state={{ offline: !online, noProvider: wallet.status === 'unavailable' && !noProviderDismissed, rejected: wallet.status === 'denied' && wallet.error !== null }}
          hidden={playing || activeSheet !== null}
          onDismissNoProvider={() => setNoProviderDismissed(true)}
          onRetryWallet={wallet.retry}
        />
      )}
      {splashDone && swipeHint && !playing && activeSheet === null && gameOver === null && <div className="nc-defer-in"><SwipeHint /></div>}
      {splashDone && playing && hint.value && <HintPill text={hint.value} />}
      <InfoCard
        game={game}
        best={stats.best}
        plays={stats.plays}
        tips={stats.tips}
        hidden={playing || gameOver !== null}
        onTip={openTip}
        onShare={share}
      />
      <NavDock
        playing={playing}
        sheet={activeSheet}
        onFeed={closeSheet}
        onCup={() => openSheet('cup')}
        onWallet={() => openSheet('wallet')}
        onExitPlay={exitPlay}
      />

      {splashDone && activeSheet === 'tip' && (
        <TipSheet
          key={game.id}
          game={game}
          tipsSoFar={stats.tips}
          onSend={sendTipTo(game)}
          onSent={(amount, hash) => tipSent(game, amount, hash)}
          onClose={closeSheet}
        />
      )}
      {splashDone && activeSheet === 'cup' && (
        <CupSheet games={games} initialGameId={game.id} address={connected ? wallet.address : null} onClose={closeSheet} />
      )}
      {splashDone && activeSheet === 'wallet' && (
        <WalletSheet
          status={wallet.status}
          connected={connected}
          address={wallet.address}
          error={wallet.error}
          tipsSent={stats.tipsSent}
          onConnect={connectWallet}
          onDisconnect={() => { setForgotWallet(true); closeSheet() }}
          onClose={closeSheet}
        />
      )}
      {splashDone && tipSuccess.value && <TipSuccess {...tipSuccess.value} />}
      {splashDone && toast.value && <Toast text={toast.value} />}
      <Splash ready={firstCardReady} onExited={onSplashExited} />
    </main>
  )
}

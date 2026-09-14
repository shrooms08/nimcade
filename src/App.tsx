import { useCallback, useEffect, useRef, useState } from 'react'
import Feed from './components/Feed'
import StatusPill from './components/StatusPill'
import Toast from './components/Toast'
import type { ToastMessage } from './components/Toast'
import { games } from './games/registry'
import type { Game } from './games/types'
import { sendTip, toMessage } from './lib/nimiq'
import { TIP_NIM } from './lib/tip'
import { useWallet } from './lib/useWallet'

const TOAST_MS = 6000

export default function App() {
  const wallet = useWallet()
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastTimer = useRef<number | null>(null)

  const showToast = useCallback((tone: ToastMessage['tone'], text: string) => {
    if (toastTimer.current !== null)
      window.clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), tone, text })
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(() => () => {
    if (toastTimer.current !== null)
      window.clearTimeout(toastTimer.current)
  }, [])

  const handleTip = useCallback(
    async (game: Game) => {
      const nimiq = await wallet.getProvider()
      if (!nimiq) {
        showToast('error', 'Open Nimcade inside Nimiq Pay to send a tip.')
        return
      }

      try {
        // Rejected dialogs land here as a normal error — never a crash.
        const hash = await sendTip(nimiq, game.makerAddress, TIP_NIM)
        showToast('success', `Sent ${TIP_NIM} NIM · ${shortenHash(hash)}`)
      }
      catch (error) {
        showToast('error', toMessage(error))
      }
    },
    [showToast, wallet],
  )

  return (
    <main className="app">
      <header className="app__header">
        <span className="app__brand">Nimcade</span>
        <StatusPill wallet={wallet} />
      </header>

      <Feed games={games} onTip={handleTip} />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </main>
  )
}

function shortenHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash
}

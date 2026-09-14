import { useEffect, useState } from 'react'
import { cupSource } from '../../lib/cup'
import type { WalletStatus } from '../../lib/useWallet'
import { copyText } from '../clipboard'
import { Coin } from '../components/Coin'
import { CopyIcon, NoticeIcon } from '../components/icons'
import { Sheet } from '../components/Sheet'
import { DisplayNameRow } from './DisplayNameRow'
import { shortAddress } from '../format'

/** Display name, then connect or see the connected wallet: address, tips sent, Cup winnings. */
export function WalletSheet({
  status,
  connected,
  address,
  error,
  tipsSent,
  onConnect,
  onDisconnect,
  onClose,
}: {
  status: WalletStatus
  connected: boolean
  address: string | null
  error: string | null
  tipsSent: number
  onConnect: () => void
  onDisconnect: () => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [winnings, setWinnings] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    cupSource.getWinnings(connected ? address : null).then((nim) => {
      if (!cancelled)
        setWinnings(nim)
    })
    return () => {
      cancelled = true
    }
  }, [address, connected])

  useEffect(() => {
    if (!copied)
      return
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (!connected || !address) {
    const busy = status === 'connecting' || status === 'authorizing'
    const sub = status === 'unavailable'
      ? 'Open Nimcade inside Nimiq Pay to connect.'
      : status === 'denied'
        ? `The wallet declined the request${error ? ` (${error})` : ''}.`
        : busy ? 'Confirm in Nimiq Pay…' : 'Your Nimiq Pay wallet, one tap'
    return (
      <Sheet label="Connect wallet" onClose={onClose}>
        <DisplayNameRow />
        <div className="nc-wallet-hero">
          <Coin size={56} />
          <h2 className="nc-sheet__title">Connect wallet</h2>
          <p className={status === 'denied' ? 'nc-sheet__sub nc-sheet__sub--warn' : 'nc-sheet__sub'}>{sub}</p>
        </div>
        <button
          type="button"
          className={busy ? 'nc-btn nc-btn--gold nc-btn--cta nc-btn--busy' : 'nc-btn nc-btn--gold nc-btn--cta'}
          onClick={onConnect}
          aria-busy={busy}
        >
          {busy && <span className="nc-spinner" aria-hidden="true" />}
          {status === 'denied' ? 'Try again' : 'Connect wallet'}
        </button>
        <p className="nc-wallet-note">
          No account, no email. Play and keep your scores on this device without connecting — the wallet is only needed to tip and to enter the Daily Cup.
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet label="Wallet" onClose={onClose}>
      <DisplayNameRow />
      <div className="nc-wallet-id">
        <Coin size={40} />
        <div className="nc-wallet-id__text">
          <span className="nc-wallet-id__address">{shortAddress(address)}</span>
          <span className="nc-wallet-id__sub">Nimiq Pay · connected</span>
        </div>
        <button
          type="button"
          className="nc-copy"
          onClick={async () => setCopied(await copyText(address.replace(/\s+/g, ' ')))}
        >
          <CopyIcon />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="nc-wallet-tiles">
        <div className="nc-wallet-tile">
          <span className="nc-caps">Tips sent</span>
          <span className="nc-wallet-tile__value nc-num"><Coin size={16} />{tipsSent.toLocaleString()}</span>
        </div>
        <div className="nc-wallet-tile">
          <span className="nc-caps">Cup winnings</span>
          {/* TODO(backend): mock winnings from cupMock */}
          <span className="nc-wallet-tile__value nc-wallet-tile__value--gold nc-num"><Coin size={16} />{winnings ?? '—'}</span>
        </div>
      </div>
      <div className="nc-wallet-explainer">
        <NoticeIcon />
        <span>Sign scores to enter the Cup — one signature per run proves the score came from your device. Free, no transaction.</span>
      </div>
      <button type="button" className="nc-wallet-disconnect" onClick={onDisconnect}>Disconnect</button>
    </Sheet>
  )
}

import { shortenAddress } from '../lib/nimiq'
import type { Wallet } from '../lib/useWallet'

export default function StatusPill({ wallet }: { wallet: Wallet }) {
  const { status, address, retry } = wallet

  if (status === 'ready' && address) {
    return (
      <div className="pill pill--ready">
        <span className="pill__dot" />
        {shortenAddress(address)}
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <button type="button" className="pill pill--action" onClick={retry}>
        Connect wallet
      </button>
    )
  }

  if (status === 'unavailable')
    return <div className="pill pill--muted">Open in Nimiq Pay</div>

  return (
    <div className="pill">
      <span className="pill__dot pill__dot--pulse" />
      Connecting…
    </div>
  )
}

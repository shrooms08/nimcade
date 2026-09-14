import { Coin } from '../components/Coin'

/** The "For You | Top" segmented pill and the wallet chip. In play the pill fades and the chip collapses to its coin. */
export function TopChrome({
  playing,
  walletLabel,
  onTop,
  onWallet,
}: {
  playing: boolean
  walletLabel: string
  onTop: () => void
  onWallet: () => void
}) {
  return (
    <>
      <div className={playing ? 'nc-top is-hidden' : 'nc-top'} aria-hidden={playing}>
        <div className="nc-segmented nc-glass" role="tablist" aria-label="Feed">
          <button type="button" role="tab" aria-selected="true" className="nc-segmented__item is-on" tabIndex={playing ? -1 : 0}>
            For You
          </button>
          <button type="button" role="tab" aria-selected="false" className="nc-segmented__item" onClick={onTop} tabIndex={playing ? -1 : 0}>
            Top
          </button>
        </div>
      </div>
      <button
        type="button"
        className={playing ? 'nc-wallet-chip nc-glass is-collapsed' : 'nc-wallet-chip nc-glass'}
        onClick={onWallet}
        aria-label={`Wallet: ${walletLabel}`}
      >
        <Coin size={20} />
        <span className="nc-wallet-chip__label">{walletLabel}</span>
      </button>
    </>
  )
}

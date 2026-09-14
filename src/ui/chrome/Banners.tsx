import { NoticeIcon, OfflineIcon } from '../components/icons'

export interface BannerState {
  offline: boolean
  /** Not running inside Nimiq Pay (no provider). */
  noProvider: boolean
  /** The wallet declined account access. */
  rejected: boolean
}

/** Edge-state notices stacked under the top chrome in browse mode. */
export function Banners({
  state,
  hidden,
  onDismissNoProvider,
  onRetryWallet,
}: {
  state: BannerState
  hidden: boolean
  onDismissNoProvider: () => void
  onRetryWallet: () => void
}) {
  if (hidden || (!state.offline && !state.noProvider && !state.rejected))
    return null
  return (
    <div className="nc-banners">
      {state.offline && (
        <div className="nc-banner nc-glass" role="status">
          <OfflineIcon />
          <span>You're offline. Games still play; tips and the Cup need a connection.</span>
        </div>
      )}
      {state.noProvider && (
        <div className="nc-banner nc-glass" role="status">
          <NoticeIcon />
          <span>Open Nimcade in Nimiq Pay to tip makers and join the Cup.</span>
          <button type="button" className="nc-banner__action nc-banner__action--muted" onClick={onDismissNoProvider}>Dismiss</button>
        </div>
      )}
      {state.rejected && (
        <div className="nc-banner nc-banner--gold nc-glass" role="status">
          <NoticeIcon />
          <span>Wallet request was declined.</span>
          <button type="button" className="nc-banner__action" onClick={onRetryWallet}>Try again</button>
        </div>
      )}
    </div>
  )
}

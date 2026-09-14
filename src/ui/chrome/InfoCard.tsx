import { compactNumber } from '../../lib/localStats'
import type { Game } from '../../games/types'
import { Coin } from '../components/Coin'
import { InfoIcon, PlayIcon, ShareIcon, StarIcon } from '../components/icons'
import { makerHandle } from '../format'

/** The floating card over the current game: title, maker, stats and the gold Tip NIM pill. */
export function InfoCard({
  game,
  best,
  plays,
  tips,
  hidden,
  onTip,
  onShare,
}: {
  game: Game
  best: number
  /** Plays on this device (TODO(backend): global plays). */
  plays: number
  /** Tips for this game from the tips table (this device's NIM tipped when the backend is off). */
  tips: number
  hidden: boolean
  onTip: () => void
  onShare: () => void
}) {
  const tab = hidden ? -1 : 0
  return (
    <div className={hidden ? 'nc-info nc-glass is-hidden' : 'nc-info nc-glass'} aria-hidden={hidden}>
      <div className="nc-info__text">
        <div className="nc-info__title-row">
          <h2 className="nc-info__title">{game.title}</h2>
          <InfoIcon />
        </div>
        <span className="nc-info__maker">by {makerHandle(game.maker)}</span>
        <div className="nc-info__stats">
          <span className="nc-stat" aria-label={`${plays} plays`}><PlayIcon />{compactNumber(plays)}</span>
          <span className="nc-stat nc-stat--best" aria-label={`Best ${best}`}><StarIcon />{best ? best.toLocaleString() : '—'}</span>
          <span className="nc-stat nc-stat--tips" aria-label={`${tips} tips`}><Coin size={13} />{tips.toLocaleString()}</span>
          <button type="button" className="nc-stat nc-stat--share" onClick={onShare} aria-label="Share" tabIndex={tab}>
            <ShareIcon />
          </button>
        </div>
      </div>
      <button type="button" className="nc-tip-pill" onClick={onTip} tabIndex={tab}>
        <Coin size={16} inverted />
        <span>Tip NIM</span>
      </button>
    </div>
  )
}

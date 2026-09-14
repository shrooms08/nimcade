import { DrawnCheck, SwipeUpIcon } from '../components/icons'
import { shortHash } from '../format'

/** First-launch nudge over the cover art. */
export function SwipeHint() {
  return (
    <div className="nc-swipe-hint" aria-hidden="true">
      <SwipeUpIcon />
      <span>Swipe up for the next game</span>
    </div>
  )
}

/** Shown for a moment after a tip goes through. */
export function TipSuccess({ amount, maker, hash }: { amount: number; maker: string; hash: string }) {
  return (
    <div className="nc-tip-success" role="status">
      <span className="nc-tip-success__badge"><DrawnCheck /></span>
      <span className="nc-tip-success__line">Sent! {amount} NIM to {maker}</span>
      <span className="nc-tip-success__hash nc-num" title={hash}>tx {shortHash(hash)}</span>
    </div>
  )
}

/** A short notice above the nav, e.g. "Link copied". */
export function Toast({ text }: { text: string }) {
  return (
    <div className="nc-toast nc-glass" role="status">{text}</div>
  )
}

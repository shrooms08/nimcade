import wordmarkBlack from './wordmark-black.svg'
import wordmarkWhite from './wordmark.svg'

/** Width over height of the wordmark SVGs' viewBox (504.82 x 72.8). */
const RATIO = 504.82 / 72.8

/**
 * Wordmark option B ("Swipe") from the UI kit: the swipe chevron and a lowercase
 * "nimcade", outlined to paths so it never waits on a font.
 */
export function Wordmark({ tone = 'white', height = 30, className }: { tone?: 'white' | 'black'; height?: number; className?: string }) {
  return (
    <img
      className={className}
      src={tone === 'white' ? wordmarkWhite : wordmarkBlack}
      alt="Nimcade"
      style={{ height, width: Math.round(height * RATIO * 10) / 10 }}
      draggable={false}
    />
  )
}

import wordmarkBlack from './wordmark-black.svg'
import wordmarkWhite from './wordmark.svg'

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
      style={{ height, width: 'auto' }}
      draggable={false}
    />
  )
}

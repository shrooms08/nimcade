import { NimcadeIcon } from './NimcadeIcon'

/**
 * The Nimcade wordmark: the mark plus the name set in Space Grotesk 700 with
 * the prototype's headline tracking. The prototype ships no wordmark asset, so
 * this is composed from its icon and type.
 */
export function Wordmark({ size = 40, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return (
    <span className={`nc-wordmark nc-wordmark--${tone}`} style={{ fontSize: size * 0.9 }} aria-label="Nimcade">
      <NimcadeIcon size={size} />
      <span aria-hidden="true">Nimcade</span>
    </span>
  )
}

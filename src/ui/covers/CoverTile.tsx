import type { ReactNode } from 'react'
import './covers.css'

export interface CoverProps {
  className?: string
  /** 'tile' is the 180px 3:4 card (the splash strip); 'full' fills its parent, as a feed card in browse. */
  variant?: 'tile' | 'full'
  /** The game's controls in a few words, shown as a "How to play" line. */
  howToPlay?: string
}

/**
 * A game's cover: tinted card, a motif drawn in a 180x176 SVG box, the title and a
 * one-line hook. Everything scales with the cover's width, so the same design works
 * as a small tile or full-bleed.
 */
export function CoverTile({ game, title, hook, art, className, variant = 'tile', howToPlay }: CoverProps & {
  /** Game id; picks the tint (nc-cover--<id>). */
  game: string
  title: string
  hook: string
  art: ReactNode
}) {
  const classes = ['nc-cover', `nc-cover--${game}`, variant === 'full' && 'nc-cover--full', className].filter(Boolean).join(' ')
  return (
    <div className={classes} role="img" aria-label={howToPlay ? `${title}: ${hook} How to play: ${howToPlay}` : `${title}: ${hook}`}>
      <svg className="nc-cover__art" viewBox="0 0 180 176" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {art}
      </svg>
      <div className="nc-cover__text" aria-hidden="true">
        <span className="nc-cover__title">{title}</span>
        <span className="nc-cover__hook">{hook}</span>
        {howToPlay && (
          <span className="nc-cover__how">
            <span className="nc-cover__how-label">How to play</span>
            {howToPlay}
          </span>
        )}
      </div>
    </div>
  )
}

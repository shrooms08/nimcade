import type { ReactNode } from 'react'
import './covers.css'

export interface CoverProps {
  className?: string
}

/**
 * A game's cover: tinted card, a motif drawn in a 180x176 SVG box, the title and a
 * one-line hook. Sized by its width (180px by default, 3:4), so it scales anywhere.
 */
export function CoverTile({ game, title, hook, art, className }: {
  /** Game id; picks the tint (nc-cover--<id>). */
  game: string
  title: string
  hook: string
  art: ReactNode
  className?: string
}) {
  return (
    <div className={className ? `nc-cover nc-cover--${game} ${className}` : `nc-cover nc-cover--${game}`} role="img" aria-label={`${title}: ${hook}`}>
      <svg className="nc-cover__art" viewBox="0 0 180 176" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {art}
      </svg>
      <div className="nc-cover__text" aria-hidden="true">
        <span className="nc-cover__title">{title}</span>
        <span className="nc-cover__hook">{hook}</span>
      </div>
    </div>
  )
}

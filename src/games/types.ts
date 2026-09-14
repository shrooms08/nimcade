import type { ComponentType } from 'react'

/**
 * Props every Nimcade game receives from the feed.
 *
 * A game MUST pause and reset itself whenever `active` becomes false: only the
 * card currently filling the viewport is active, and a game that keeps running
 * off-screen burns battery and produces scores the player never saw.
 */
export interface GameProps {
  active: boolean
  onScore: (score: number) => void
}

export interface Game {
  /** Stable id, also used as the localStorage key for the best score. */
  id: string
  title: string
  /** Display name of the maker, shown as "by {maker}". */
  maker: string
  /** Nimiq user-friendly address the tip is sent to, e.g. "NQ07 0000 ...". */
  makerAddress: string
  component: ComponentType<GameProps>
}

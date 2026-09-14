import { createElement } from 'react'
import type { ComponentType, ReactElement } from 'react'
import { DOT_RUSH_ID } from '../../games/DotRush'
import { FLIP_DODGE_ID } from '../../games/FlipDodge'
import { TAP_FRENZY_ID } from '../../games/TapFrenzy'
import { THE_VOID_ID } from '../../games/TheVoid'
import { TOWER_UP_ID } from '../../games/TowerUp'
import type { CoverProps } from './CoverTile'
import { DotRushCover } from './DotRushCover'
import { FlipDodgeCover } from './FlipDodgeCover'
import { TapFrenzyCover } from './TapFrenzyCover'
import { TheVoidCover } from './TheVoidCover'
import { TowerUpCover } from './TowerUpCover'

export type { CoverProps } from './CoverTile'

const COVERS: Record<string, ComponentType<CoverProps>> = {
  [DOT_RUSH_ID]: DotRushCover,
  [TOWER_UP_ID]: TowerUpCover,
  [THE_VOID_ID]: TheVoidCover,
  [FLIP_DODGE_ID]: FlipDodgeCover,
  [TAP_FRENZY_ID]: TapFrenzyCover,
}

/** The cover tile for a game, or undefined for a game that has none yet. */
export function getCover(gameId: string): ComponentType<CoverProps> | undefined {
  return COVERS[gameId]
}

/** Renders a game's cover, or null for a game without one. */
export function renderCover(gameId: string, props: CoverProps = {}): ReactElement | null {
  const Cover = COVERS[gameId]
  return Cover ? createElement(Cover, props) : null
}

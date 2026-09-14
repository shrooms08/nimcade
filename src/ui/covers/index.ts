import { createElement } from 'react'
import type { ComponentType, ReactElement } from 'react'
import { NIMNOM_ID } from '../../games/NimNom'
import { DODGE_ID } from '../../games/Dodge'
import { TAP_SPEED_ID } from '../../games/TapSpeed'
import { VOID_RUN_ID } from '../../games/VoidRun'
import { BUILD_UP_ID } from '../../games/BuildUp'
import type { CoverProps } from './CoverTile'
import { NimNomCover } from './NimNomCover'
import { DodgeCover } from './DodgeCover'
import { TapSpeedCover } from './TapSpeedCover'
import { VoidRunCover } from './VoidRunCover'
import { BuildUpCover } from './BuildUpCover'

export type { CoverProps } from './CoverTile'

const COVERS: Record<string, ComponentType<CoverProps>> = {
  [NIMNOM_ID]: NimNomCover,
  [BUILD_UP_ID]: BuildUpCover,
  [VOID_RUN_ID]: VoidRunCover,
  [DODGE_ID]: DodgeCover,
  [TAP_SPEED_ID]: TapSpeedCover,
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

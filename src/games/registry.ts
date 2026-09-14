import DotRush, { DOT_RUSH_ID } from './DotRush'
import FlipDodge, { FLIP_DODGE_ID } from './FlipDodge'
import TapFrenzy, { TAP_FRENZY_ID } from './TapFrenzy'
import TheVoid, { THE_VOID_ID } from './TheVoid'
import TowerUp, { TOWER_UP_ID } from './TowerUp'
import type { Game } from './types'

/** Fallback keeps the feed rendering when the env var is missing in dev. */
const MAKER_ADDRESS
  = import.meta.env.VITE_MAKER_ADDRESS
    ?? 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

/** Rendered top to bottom in the feed. */
export const games: Game[] = [
  { id: DOT_RUSH_ID, title: 'Dot Rush', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Tap the arrows to move', component: DotRush },
  { id: TOWER_UP_ID, title: 'Tower Up', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Hold to lower, release to drop', component: TowerUp },
  { id: THE_VOID_ID, title: 'The Void', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Drag to steer', component: TheVoid },
  { id: FLIP_DODGE_ID, title: 'Flip Dodge', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Tap to flip lanes', component: FlipDodge },
  { id: TAP_FRENZY_ID, title: 'Tap Frenzy', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Tap as fast as you can', component: TapFrenzy },
]

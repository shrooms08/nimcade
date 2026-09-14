import DotRush, { DOT_RUSH_ID } from './DotRush'
import FlipDodge, { FLIP_DODGE_ID } from './FlipDodge'
import StackDrop, { STACK_DROP_ID } from './StackDrop'
import TapTempo, { TAP_TEMPO_ID } from './TapTempo'
import type { Game } from './types'

/** Fallback keeps the feed rendering when the env var is missing in dev. */
const MAKER_ADDRESS
  = import.meta.env.VITE_MAKER_ADDRESS
    ?? 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

/** Rendered top to bottom in the feed. */
export const games: Game[] = [
  { id: DOT_RUSH_ID, title: 'Dot Rush', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, component: DotRush },
  { id: STACK_DROP_ID, title: 'Stack Drop', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, component: StackDrop },
  { id: FLIP_DODGE_ID, title: 'Flip Dodge', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, component: FlipDodge },
  { id: TAP_TEMPO_ID, title: 'Tap Tempo', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, component: TapTempo },
]

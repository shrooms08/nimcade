import DotRush, { DOT_RUSH_ID } from './DotRush'
import TapTempo from './TapTempo'
import type { Game } from './types'

/** Fallback keeps the feed rendering when the env var is missing in dev. */
const MAKER_ADDRESS
  = import.meta.env.VITE_MAKER_ADDRESS
    ?? 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

/** Rendered top to bottom in the feed. */
export const games: Game[] = [
  {
    id: DOT_RUSH_ID,
    title: 'Dot Rush',
    maker: 'Nimcade',
    makerAddress: MAKER_ADDRESS,
    component: DotRush,
  },
  {
    id: 'tap-tempo',
    title: 'Tap Tempo',
    maker: 'Nimcade',
    makerAddress: MAKER_ADDRESS,
    component: TapTempo,
  },
]

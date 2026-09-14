import type { Game } from './types'
import TapTempo from './TapTempo'

/** Fallback keeps the feed rendering when the env var is missing in dev. */
const MAKER_ADDRESS
  = import.meta.env.VITE_MAKER_ADDRESS
    ?? 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

export const games: Game[] = [
  {
    id: 'tap-tempo',
    title: 'Tap Tempo',
    maker: 'Nimcade',
    makerAddress: MAKER_ADDRESS,
    component: TapTempo,
  },
]

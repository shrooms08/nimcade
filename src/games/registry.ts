import NimNom, { NIMNOM_ID } from './NimNom'
import Dodge, { DODGE_ID } from './Dodge'
import TapSpeed, { TAP_SPEED_ID } from './TapSpeed'
import VoidRun, { VOID_RUN_ID } from './VoidRun'
import BuildUp, { BUILD_UP_ID } from './BuildUp'
import type { Game } from './types'

/** Fallback keeps the feed rendering when the env var is missing in dev. */
const MAKER_ADDRESS
  = import.meta.env.VITE_MAKER_ADDRESS
    ?? 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

/** Rendered top to bottom in the feed. */
export const games: Game[] = [
  { id: NIMNOM_ID, title: 'NimNom', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Tap the arrows to move', component: NimNom },
  { id: BUILD_UP_ID, title: 'Build Up', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Hold to lower, release to drop', component: BuildUp },
  { id: VOID_RUN_ID, title: 'Void Run', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Drag to steer', component: VoidRun, preload: () => import('./VoidRunRender') },
  { id: DODGE_ID, title: 'Dodge', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Tap to flip lanes', component: Dodge },
  { id: TAP_SPEED_ID, title: 'Tap Speed', maker: 'Nimcade', makerAddress: MAKER_ADDRESS, hint: 'Tap as fast as you can', component: TapSpeed },
]

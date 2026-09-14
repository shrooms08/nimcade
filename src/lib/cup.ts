import { apiCupSource } from './cupApi'
import type { CupDataSource } from './cupMock'
import { mockCupSource } from './cupMock'
import { backendOn } from './supabase'

export type { CupDataSource, CupEntry, CupPlayer, CupSnapshot, CupStanding } from './cupMock'

/** The Daily Cup data the sheets read: Supabase, or the mock with VITE_USE_MOCK=true. */
export const cupSource: CupDataSource = backendOn ? apiCupSource : mockCupSource

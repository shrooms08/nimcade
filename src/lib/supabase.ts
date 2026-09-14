import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * The browser's Supabase client: anon (publishable) key only, which can read the public Cup
 * data and nothing else. Every write goes through Edge Functions. Null when not configured.
 */
export const supabase: SupabaseClient | null = url && anonKey && /^https?:\/\//.test(url)
  ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  : null

/** The live Cup (board, entries, tip counts) is on unless VITE_USE_MOCK=true or Supabase isn't configured. */
export const backendOn = supabase !== null && import.meta.env.VITE_USE_MOCK !== 'true'

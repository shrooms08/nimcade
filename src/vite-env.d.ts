/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAKER_ADDRESS?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** "true" keeps the Daily Cup on mock data. */
  readonly VITE_USE_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

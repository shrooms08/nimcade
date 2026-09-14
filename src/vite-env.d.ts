/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAKER_ADDRESS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

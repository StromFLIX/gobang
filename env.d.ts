/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_LEGAL_OPERATOR_NAME?: string
  readonly VITE_LEGAL_COUNTRY?: string
  readonly VITE_LEGAL_EMAIL?: string
  readonly VITE_LEGAL_PHONE?: string
  readonly VITE_LEGAL_REGISTER_ENTRY?: string
  readonly VITE_LEGAL_VAT_ID?: string
  readonly VITE_LEGAL_HOSTING_PROVIDER?: string
  readonly VITE_LEGAL_HOSTING_LOCATION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

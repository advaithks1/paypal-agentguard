/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DATA_MODE?: 'demo' | 'api';
}
interface ImportMeta { readonly env: ImportMetaEnv }

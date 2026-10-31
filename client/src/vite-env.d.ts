/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the API lives. Empty: same origin, with Vite forwarding /api to the server. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="node" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

/**
 * Environment variables (Vite)
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_WS_PATH?: string;
  readonly VITE_WS_ADMIN_PATH?: string;
  readonly VITE_API_KEY?: string;
  readonly VITE_WHATSAPP_PHONE?: string;
  readonly VITE_DEFAULT_COUNTRY?: string;
  readonly VITE_LICENSE_EXPIRY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Static asset module declarations
 * (so TypeScript allows importing images)
 */
declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.jpeg" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.webp" {
  const src: string;
  export default src;
}
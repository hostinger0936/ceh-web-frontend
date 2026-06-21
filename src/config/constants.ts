/**
 * config/constants.ts — FULL & FINAL
 */

export const STORAGE_KEYS = {
  LOGGED_IN:        "zerotrace_admin_logged_in",
  USERNAME:         "zerotrace_admin_username",
  API_KEY:          "zerotrace_api_key",
  LICENSE_EXPIRY:   "zerotrace_license_expiry",
  WHATSAPP_PHONE:   "zerotrace_whatsapp_phone",
  LAST_CRASH_DEVICE:"zerotrace_last_crash_device",
};

export const ENV = {
  API_BASE:         (import.meta.env.VITE_API_BASE       as string) || "",
  WS_PATH:          (import.meta.env.VITE_WS_PATH        as string) || "/ws",
  WS_ADMIN_PATH:    (import.meta.env.VITE_WS_ADMIN_PATH  as string) || "/ws/admin",
  API_KEY:          (import.meta.env.VITE_API_KEY        as string) || "",
  WHATSAPP_PHONE:   (import.meta.env.VITE_WHATSAPP_PHONE as string) || "",
  DEFAULT_COUNTRY:  (import.meta.env.VITE_DEFAULT_COUNTRY as string) || "91",
  LICENSE_EXPIRY:   (import.meta.env.VITE_LICENSE_EXPIRY as string) || "",

  // ── New variables ──
  PANEL_ID:         (import.meta.env.VITE_PANEL_ID          as string) || "",
  WHATSAPP_TARGET:  (import.meta.env.VITE_WHATSAPP_TARGET   as string) || "",
  TELEGRAM_CHANNEL: (import.meta.env.VITE_TELEGRAM_CHANNEL  as string) || "",
  VERSION:          (import.meta.env.VITE_VERSION           as string) || "v1.0",
};

export function getApiKey(): string {
  const envKey = ENV.API_KEY || "";
  if (envKey && envKey !== "changeme") return envKey;
  try { return localStorage.getItem(STORAGE_KEYS.API_KEY) || ""; } catch { return ""; }
}

export function apiHeaders(extra: Record<string, any> = {}) {
  const key = getApiKey();
  const headers: Record<string, any> = { ...extra };
  if (key) headers["x-api-key"] = key;
  return headers;
}

/**
 * config/constants.ts
 * Runtime config — sensitive values fetched from /proxy/api/admin/panel-config at startup.
 * NOTHING sensitive is baked into the JS bundle.
 */
export const STORAGE_KEYS = {
  LOGGED_IN:         "zerotrace_admin_logged_in",
  USERNAME:          "zerotrace_admin_username",
  LICENSE_EXPIRY:    "zerotrace_license_expiry",
  WHATSAPP_PHONE:    "zerotrace_whatsapp_phone",
  LAST_CRASH_DEVICE: "zerotrace_last_crash_device",
};

// Mutable ENV object — properties filled at runtime by setRuntimeConfig()
export const ENV: Record<string, string> = {
  API_BASE:           "/proxy",   // hardcoded — CF Worker handles routing
  WS_PATH:            "/ws",
  WS_ADMIN_PATH:      "/ws/admin",
  API_KEY:            "",         // intentionally empty — CF Worker injects key
  WS_URL:             "",         // set at runtime from panel-config
  PANEL_ID:           "",         // set at runtime
  WHATSAPP_TARGET:    "",         // set at runtime (WP contact number)
  TELEGRAM_TARGET:    "",         // set at runtime (TG renewal username)
  RENEWAL_START_DATE: "",         // set at runtime
  RENEWAL_DAYS:       "30",       // set at runtime
  DEFAULT_COUNTRY:    "91",
  VERSION:            "v1.0",
  // Keep these for any code still referencing them
  WHATSAPP_PHONE:     "",
  TELEGRAM_CHANNEL:   "",
  LICENSE_EXPIRY:     "",
};

/** Called once from main.tsx after /proxy/api/admin/panel-config fetch */
export function setRuntimeConfig(cfg: Record<string, any>) {
  if (cfg.panelId)          { ENV.PANEL_ID = cfg.panelId; }
  if (cfg.wsUrl)             { ENV.WS_URL = cfg.wsUrl; }
  if (cfg.wpContact)         { ENV.WHATSAPP_TARGET = cfg.wpContact; ENV.WHATSAPP_PHONE = cfg.wpContact; }
  if (cfg.telegramTarget)   { ENV.TELEGRAM_TARGET = cfg.telegramTarget; }
  if (cfg.telegramChannel)  { ENV.TELEGRAM_CHANNEL = cfg.telegramChannel; }
  if (cfg.renewalStartDate) { ENV.RENEWAL_START_DATE = cfg.renewalStartDate; ENV.LICENSE_EXPIRY = cfg.renewalStartDate; }
  if (cfg.renewalDays)      { ENV.RENEWAL_DAYS = String(cfg.renewalDays); }
  if (cfg.version)           { ENV.VERSION = cfg.version; }
}

/** No API key in frontend — CF Worker injects it server-side */
export function getApiKey(): string { return ""; }

export function apiHeaders(extra: Record<string, any> = {}): Record<string, any> {
  return { ...extra };
}

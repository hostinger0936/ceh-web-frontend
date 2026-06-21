import api from "./apiClient";
import type { AdminSessionDoc } from "../../types";

/* ═══════════════════════════════════════════
   SESSION ID — unique per browser tab/login
   ═══════════════════════════════════════════ */

const SESSION_ID_KEY = "zerotrace_session_id";

/** Generate a UUID v4 */
function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Get or create session ID for this browser tab.
 * Stored in localStorage — shared across all tabs.
 * 1 browser = 1 sessionId. Different browser/device = different session.
 */
export function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_ID_KEY);
    if (existing && existing.trim()) return existing.trim();

    const id = uuid();
    localStorage.setItem(SESSION_ID_KEY, id);
    return id;
  } catch {
    return uuid();
  }
}

/** Clear session ID (on logout) */
export function clearSessionId(): void {
  try {
    localStorage.removeItem(SESSION_ID_KEY);
  } catch {}
}

/* ═══════════════════════════════════════════
   ADMIN LOGIN
   ═══════════════════════════════════════════ */

export async function getAdminLogin(): Promise<{ username: string; password: string }> {
  const res = await api.get(`/api/admin/login`);
  return {
    username: res.data?.username || "",
    password: res.data?.password || "",
  };
}

export async function saveAdminLogin(username: string, password: string) {
  const res = await api.put(`/api/admin/login`, { username, password });
  return res.data;
}

/* ═══════════════════════════════════════════
   GLOBAL PHONE
   ═══════════════════════════════════════════ */

export async function getGlobalPhone(): Promise<string> {
  const res = await api.get(`/api/admin/globalPhone`);
  const data = res.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "phone" in data) return (data as any).phone || "";
  return "";
}

export async function setGlobalPhone(phone: string) {
  const res = await api.put(`/api/admin/globalPhone`, { phone });
  return res.data;
}

/* ═══════════════════════════════════════════
   DELETE PASSWORD
   ═══════════════════════════════════════════ */

export async function getDeletePasswordStatus(): Promise<{ isSet: boolean }> {
  const res = await api.get(`/api/admin/deletePassword/status`);
  return {
    isSet: !!res.data?.isSet,
  };
}

export async function verifyDeletePassword(password: string): Promise<{
  success: boolean;
  verified: boolean;
  created: boolean;
  error?: string;
}> {
  const res = await api.post(`/api/admin/deletePassword/verify`, { password });
  return {
    success: !!res.data?.success,
    verified: !!res.data?.verified,
    created: !!res.data?.created,
    error: res.data?.error,
  };
}

export async function changeDeletePassword(currentPassword: string, newPassword: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await api.post(`/api/admin/deletePassword/change`, {
    currentPassword,
    newPassword,
  });

  return {
    success: !!res.data?.success,
    message: res.data?.message,
    error: res.data?.error,
  };
}

/* ═══════════════════════════════════════════
   ADMIN SESSIONS
   ═══════════════════════════════════════════ */

/**
 * Create admin session — sends unique sessionId + userAgent.
 * Each browser tab login = separate session row in DB.
 */
export async function createAdminSession(admin: string, deviceId: string) {
  const sessionId = getOrCreateSessionId();
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

  const res = await api.post(`/api/admin/session/create`, {
    admin,
    deviceId,
    sessionId,
    userAgent,
  });

  return res.data;
}

/**
 * Ping session — keeps lastSeen fresh.
 */
export async function pingAdminSession(admin: string, deviceId: string) {
  const sessionId = getOrCreateSessionId();

  const res = await api.post(`/api/admin/session/ping`, {
    admin,
    deviceId,
    sessionId,
  });
  return res.data;
}

/**
 * List all sessions.
 */
export async function listSessions(): Promise<AdminSessionDoc[]> {
  const res = await api.get(`/api/admin/sessions`);
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * Logout specific session by sessionId.
 */
export async function logoutSession(sessionId: string) {
  const res = await api.delete(`/api/admin/sessions/by-session/${encodeURIComponent(sessionId)}`);
  return res.data;
}

/**
 * Logout all sessions for a deviceId (backward compatible).
 */
export async function logoutDevice(deviceId: string) {
  const res = await api.delete(`/api/admin/sessions/${encodeURIComponent(deviceId)}`);
  return res.data;
}

/**
 * Logout ALL sessions.
 */
export async function logoutAll() {
  const res = await api.delete(`/api/admin/sessions`);
  return res.data;
}

/* ═══════════════════════════════════════════
   SESSION LIMIT
   ═══════════════════════════════════════════ */

export async function getSessionLimit(): Promise<{ limit: number; currentCount: number }> {
  const res = await api.get(`/api/admin/session/limit`);
  return {
    limit: Number(res.data?.limit || 5),
    currentCount: Number(res.data?.currentCount || 0),
  };
}

export async function updateSessionLimit(limit: number, securityCode: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await api.put(`/api/admin/session/limit`, { limit, securityCode });
    return { success: !!res.data?.success };
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || "Failed",
    };
  }
}

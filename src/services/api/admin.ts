import api from "./apiClient";
import type { AdminSessionDoc } from "../../types";

/* ═══════════════════════════════════════════
   SESSION ID — unique per browser tab/login
   ═══════════════════════════════════════════ */

const SESSION_ID_KEY = "zerotrace_session_id";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

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

export function clearSessionId(): void {
  try {
    localStorage.removeItem(SESSION_ID_KEY);
  } catch {}
}

/* ═══════════════════════════════════════════
   ADMIN LOGIN
   ═══════════════════════════════════════════ */

// Sirf username return hoga — password nahi
export async function getAdminLogin(): Promise<{ username: string }> {
  const res = await api.get(`/api/admin/login`);
  return {
    username: res.data?.username || "",
  };
}

// Server side verify — bcrypt + rate limiting
export async function verifyAdminLogin(username: string, password: string): Promise<{
  success: boolean;
  firstLogin?: boolean;
  error?: string;
}> {
  try {
    const res = await api.post(`/api/admin/login/verify`, { username, password });
    return {
      success: !!res.data?.success,
      firstLogin: !!res.data?.firstLogin,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || "Login failed",
    };
  }
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
  return { isSet: !!res.data?.isSet };
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
  const res = await api.post(`/api/admin/deletePassword/change`, { currentPassword, newPassword });
  return {
    success: !!res.data?.success,
    message: res.data?.message,
    error: res.data?.error,
  };
}

/* ═══════════════════════════════════════════
   ADMIN SESSIONS
   ═══════════════════════════════════════════ */

export async function createAdminSession(admin: string, deviceId: string) {
  const sessionId = getOrCreateSessionId();
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const res = await api.post(`/api/admin/session/create`, { admin, deviceId, sessionId, userAgent });
  return res.data;
}

export async function pingAdminSession(admin: string, deviceId: string) {
  const sessionId = getOrCreateSessionId();
  const res = await api.post(`/api/admin/session/ping`, { admin, deviceId, sessionId });
  return res.data;
}

export async function listSessions(): Promise<AdminSessionDoc[]> {
  const res = await api.get(`/api/admin/sessions`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function logoutSession(sessionId: string) {
  const res = await api.delete(`/api/admin/sessions/by-session/${encodeURIComponent(sessionId)}`);
  return res.data;
}

export async function logoutDevice(deviceId: string) {
  const res = await api.delete(`/api/admin/sessions/${encodeURIComponent(deviceId)}`);
  return res.data;
}

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

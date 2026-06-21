import { STORAGE_KEYS } from "../../config/constants";

/**
 * auth.ts — FULL & FINAL
 *
 * CRITICAL: Do NOT import anything from "./admin" or "./apiClient" here.
 * Circular dependency chain: apiClient → auth → admin → apiClient
 * This will crash isLoggedIn() and break login protection entirely.
 */

export function isLoggedIn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.LOGGED_IN) === "true";
  } catch {
    return false;
  }
}

export function getLoggedInUser(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.USERNAME) || "admin";
  } catch {
    return "admin";
  }
}

export function setLoggedIn(user: string) {
  try {
    localStorage.setItem(STORAGE_KEYS.LOGGED_IN, "true");
    localStorage.setItem(STORAGE_KEYS.USERNAME, (user || "admin").trim());
  } catch {
    // ignore
  }
}

export function logout() {
  try {
    localStorage.removeItem(STORAGE_KEYS.LOGGED_IN);
    localStorage.removeItem(STORAGE_KEYS.USERNAME);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem("zerotrace_session_id");
    localStorage.removeItem("zerotrace_session_created");
  } catch {
    // ignore
  }
}

/**
 * helpers.ts — FULL & FINAL
 * Small reusable helpers for UI.
 */

export function safeJsonParse<T = any>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function nowMs(): number {
  return Date.now();
}

export function formatDateTime(ts?: number | string | Date | null): string {
  if (!ts) return "-";
  try {
    const d =
      typeof ts === "number"
        ? new Date(ts)
        : ts instanceof Date
        ? ts
        : new Date(String(ts));
    return d.toLocaleString();
  } catch {
    return String(ts);
  }
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function toNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
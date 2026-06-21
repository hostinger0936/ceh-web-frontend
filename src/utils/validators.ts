/**
 * validators.ts — FULL & FINAL
 * Lightweight validators for common inputs (phone/date/uniqueid).
 */

const dobRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;

export function isNonEmptyString(v: any): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function isValidUniqueId(id?: string | null): boolean {
  if (!id) return false;
  const s = id.trim();
  return /^[a-zA-Z0-9\-_]{4,128}$/.test(s);
}

export function sanitizePhone(raw?: string | null): string {
  if (!raw) return "";
  const s = raw.toString().trim();
  if (!s) return "";
  const keepPlus = s.startsWith("+");
  const digits = s.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return keepPlus ? `+${digits}` : digits;
}

export function isValidDOB(dob?: string | null): boolean {
  if (!dob) return false;
  return dobRegex.test(dob.trim());
}

export function isValidISODate(iso?: string | null): boolean {
  if (!iso) return false;
  // YYYY-MM-DD basic check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return false;
  const d = new Date(iso.trim() + "T00:00:00Z");
  return !isNaN(d.getTime());
}
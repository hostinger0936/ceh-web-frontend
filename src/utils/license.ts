// src/utils/license.ts

export type LicenseSnapshot = {
  panelId: string;
  telegramTarget: string;
  renewalStartRaw: string;
  renewalDays: number;

  startDate: Date | null;
  expiryDate: Date | null;
  expiryISO: string;
  isExpired: boolean;

  renewalMessage: string;

  telegramUsername: string; // extracted from target
  telegramChatDeepLink: string; // tg://resolve?...&text=...
  telegramShareUrl: string; // https://t.me/share/url?text=...
};

const DAY_MS = 24 * 60 * 60 * 1000;

function envStr(key: string, fallback = ""): string {
  const e = import.meta.env as any;
  const v = e?.[key];
  return String(v ?? fallback).trim();
}

function envNum(key: string, fallback: number): number {
  const raw = envStr(key, "");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseDMYOrISO(input: string): Date | null {
  const s = (input || "").trim();
  if (!s) return null;

  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    const yy = Number(dmy[3]);
    const d = new Date(yy, mm - 1, dd);
    d.setHours(0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const yy = Number(iso[1]);
    const mm = Number(iso[2]);
    const dd = Number(iso[3]);
    const d = new Date(yy, mm - 1, dd);
    d.setHours(0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toISODate(d: Date | null): string {
  if (!d) return "";
  const yy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatDMY(d: Date | null): string {
  if (!d) return "--/--/----";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}/${mm}/${yy}`;
}

export function buildRenewalMessage(panelId: string): string {
  const pid = (panelId || "").trim() || "____";
  return `Hi sir i want to renewal my pannel, pannel id ${pid}`;
}

function normalizeTelegramUsername(target: string): string {
  const t = (target || "").trim();
  if (!t) return "";

  // accept: t.me/user, https://t.me/user, @user, user
  const noProto = t.replace(/^https?:\/\//, "");
  const noTme = noProto.replace(/^t\.me\//, "");
  const noAt = noTme.startsWith("@") ? noTme.slice(1) : noTme;

  // username-only
  const u = noAt.split(/[/?#]/)[0].trim();
  return u;
}

export function buildTelegramChatDeepLink(username: string, message: string): string {
  const u = (username || "").trim();
  const text = encodeURIComponent(message);
  if (!u) return "";
  // ✅ This is the only reliable way to open Telegram chat with prefilled input
  return `tg://resolve?domain=${encodeURIComponent(u)}&text=${text}`;
}

export function buildTelegramShareUrl(message: string): string {
  return `https://t.me/share/url?text=${encodeURIComponent(message)}`;
}

export function getLicenseSnapshot(nowMs = Date.now()): LicenseSnapshot {
  const panelId = envStr("VITE_PANEL_ID", "");
  const telegramTarget = envStr("VITE_TELEGRAM_TARGET", "t.me/ownerofcardhouse");
  const renewalStartRaw = envStr("VITE_RENEWAL_START_DATE", "");
  const renewalDays = envNum("VITE_RENEWAL_DAYS", 30); // ✅ exact 30 days

  const startDate = parseDMYOrISO(renewalStartRaw);
  const expiryDate = startDate ? new Date(startDate.getTime() + renewalDays * DAY_MS) : null;
  if (expiryDate) expiryDate.setHours(0, 0, 0, 0);

  const expiryMs = expiryDate ? expiryDate.getTime() : NaN;
  const isExpired = Number.isFinite(expiryMs) ? nowMs >= expiryMs : false;

  const renewalMessage = buildRenewalMessage(panelId);
  const telegramUsername = normalizeTelegramUsername(telegramTarget);

  return {
    panelId,
    telegramTarget,
    renewalStartRaw,
    renewalDays,
    startDate,
    expiryDate,
    expiryISO: toISODate(expiryDate),
    isExpired,
    renewalMessage,
    telegramUsername,
    telegramChatDeepLink: buildTelegramChatDeepLink(telegramUsername, renewalMessage),
    telegramShareUrl: buildTelegramShareUrl(renewalMessage),
  };
}

export function getCountdown(expiryDate: Date | null, nowMs = Date.now()) {
  if (!expiryDate) return null;
  const expiryMs = expiryDate.getTime();
  const diff = Math.max(0, expiryMs - nowMs);

  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const secs = Math.floor((diff % (60 * 1000)) / 1000);

  return { days, hours, mins, secs, expired: nowMs >= expiryMs };
}

export function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}
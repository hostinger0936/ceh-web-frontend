// src/pages/LoginPage.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAdminSession, getAdminLogin, saveAdminLogin } from "../services/api/admin";
import { setLoggedIn } from "../services/api/auth";
import { ENV } from "../config/constants";
const DEFAULT_PIN = "1234";
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
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-[360px] rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 text-[18px] font-extrabold text-amber-600">⚠️ Default PIN!</div>
        <div className="text-[14px] leading-6 text-gray-700">
          Ye ek <strong>default PIN (1234)</strong> hai. Kripya ise turant change karein,
          warna aapka data chori ho sakta hai!
        </div>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onLater}
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-[14px] font-semibold text-gray-700 hover:bg-gray-100">
            Baad Mein
          </button>
          <button type="button" onClick={onChangeNow}
            className="flex-1 rounded-xl bg-amber-500 py-2.5 text-[14px] font-extrabold text-white hover:bg-amber-600">
            Change Now
          </button>
        </div>
      </div>
    </div>
  );
}
export default function LoginPage() {
  const nav = useNavigate();
  const [step,       setStep]       = useState<"token" | "pin">("token");
  const [tokenInput, setTokenInput] = useState("");
  const [pin,        setPin]        = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [storedUser, setStoredUser] = useState("");
  const [storedPass, setStoredPass] = useState("");
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
    if (/^\+?\d{8,20}$/.test(raw)) return `https://wa.me/${raw.replace(/\D/g,"")}?text=${encoded}`;
    try {
      const hasProtocol = /^https?:\/\//i.test(raw);
      const url = new URL(hasProtocol ? raw : `https://${raw}`);
      const host = url.hostname.toLowerCase();
      if (host.includes("wa.me")) { const phone = url.pathname.replace(/\D/g,""); if (phone) return `https://wa.me/${phone}?text=${encoded}`; }
      if (host.includes("api.whatsapp.com") || host.includes("whatsapp.com")) { const phone = (url.searchParams.get("phone") || url.pathname).replace(/\D/g,""); if (phone) return `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`; }
      const p = raw.replace(/\D/g,""); if (p.length >= 8) return `https://wa.me/${p}?text=${encoded}`;
    } catch { const p = raw.replace(/\D/g,""); if (p.length >= 8) return `https://wa.me/${p}?text=${encoded}`; }
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
    window.open("https://t.me/apkonlinereal_bot", "_blank", "noopener,noreferrer");
  }
  const version = safeStr(ENV.VERSION) || "v1.0";
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f2f5] px-4">
      {showWarning && (
        <DefaultPinWarning
          onLater={() => { setShowWarning(false); nav("/"); }}
          onChangeNow={() => { setShowWarning(false); nav("/", { state: { openSettings: true } }); }}
        />
      )}
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.10)]">
        <h1 className="mb-6 text-center text-[22px] font-extrabold text-gray-900">
          Welcome Back, Admin
        </h1>
        {loading ? (
          <div className="py-6 text-center text-gray-400 text-[14px]">Loading…</div>
        ) : (
          <>
            {step === "token" && (
              <form onSubmit={handleProceed} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[14px] font-semibold text-gray-600">Token ID</label>
                  <input value={tokenInput}
                    onChange={(e) => { setTokenInput(e.target.value); setError(null); }}
                    placeholder="Token ID *" autoFocus
                    className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100" />
                </div>
                {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</div>}
                <button type="submit"
                  className="rounded-xl border border-gray-800 bg-white px-5 py-2.5 text-[14px] font-extrabold text-gray-900 hover:bg-gray-50 active:scale-[0.98]">
                  Proceed
                </button>
              </form>
            )}
            {step === "pin" && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[14px] font-semibold text-gray-600">Token ID</label>
                  <input value={tokenInput} readOnly
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-[14px] text-gray-500 outline-none cursor-default" />
                </div>
                <div>
                  <label className="mb-1.5 block text-[14px] font-semibold text-gray-600">PIN</label>
                  <input ref={pinRef} value={pin}
                    onChange={(e) => { setPin(e.target.value); setError(null); }}
                    type="password" placeholder="PIN *" inputMode="numeric"
                    className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100" />
                </div>
                {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</div>}
                <div className="flex gap-3">
                  <button type="submit" disabled={saving}
                    className="rounded-xl border border-gray-800 bg-white px-5 py-2.5 text-[14px] font-extrabold text-gray-900 hover:bg-gray-50 active:scale-[0.98] disabled:opacity-60">
                    {saving ? "Signing in…" : "Sign In"}
                  </button>
                  <button type="button" onClick={() => { setStep("token"); setPin(""); setError(null); }}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50">
                    Back
                  </button>
                </div>
              </form>
            )}
            <div className="mt-5 space-y-3">
              <button type="button" onClick={() => setContactOpen(true)}
                className="w-full rounded-xl border-2 border-green-500 bg-white py-3 text-[14px] font-extrabold text-green-600 hover:bg-green-50 active:scale-[0.98]">
                Contact Us
              </button>
              <button type="button" onClick={openTelegram}
                className="w-full rounded-xl border-2 border-blue-500 bg-white py-3 text-[14px] font-extrabold text-blue-600 hover:bg-blue-50 active:scale-[0.98]">
                Telegram Channel
              </button>
              <button type="button" onClick={openSupportBot}
                className="w-full rounded-xl border-2 border-sky-400 bg-white py-3 text-[14px] font-extrabold text-sky-600 hover:bg-sky-50 active:scale-[0.98]">
                🤖 Support Bot
              </button>
            </div>
            <div className="mt-5 text-center text-[13px] font-semibold text-green-600">
              Version: {version}
            </div>
          </>
        )}
      </div>
      {contactOpen && (
        <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40"
          onClick={() => setContactOpen(false)}>
          <div className="w-full max-w-[380px] rounded-t-2xl bg-white px-5 pt-5 pb-8"
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
              <button type="button" onClick={() => { setContactOpen(false); openSupportBot(); }}
                className="w-full rounded-xl border-2 border-sky-400 py-3 text-[14px] font-extrabold text-sky-600">
                🤖 Support Bot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

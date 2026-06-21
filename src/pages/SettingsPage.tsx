// src/pages/SettingsPage.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getGlobalPhone, setGlobalPhone, getAdminLogin, saveAdminLogin } from "../services/api/admin";
import { STORAGE_KEYS } from "../config/constants";
import AnimatedAppBackground from "../components/layout/AnimatedAppBackground";

/**
 * SettingsPage.tsx — STABLE TAP / NO OVERLAY VERSION
 * - Same features preserved
 * - Global Admin Phone
 * - Change Password
 * - Adds stronger stacking order so bottom nav / overlays don't steal taps
 * - Extra bottom safe spacing to avoid fixed-nav overlap
 */

function safeTrim(v: any) {
  return (v ?? "").toString().trim();
}

function normalizePhone(raw: string) {
  const s = safeTrim(raw);
  if (!s) return "";
  const keepPlus = s.startsWith("+");
  const digits = s.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return keepPlus ? `+${digits}` : digits;
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "relative z-[20] rounded-[24px] border border-slate-200 bg-white/92 shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function GlassInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-extrabold text-slate-800">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
        className={[
          "relative z-[30] h-11 w-full rounded-2xl px-4 text-[14px]",
          "border border-slate-200 bg-white",
          "text-slate-900 placeholder:text-slate-400",
          "outline-none transition",
          "focus:border-sky-300 focus:ring-2 focus:ring-sky-100",
          disabled ? "cursor-not-allowed opacity-70" : "",
        ].join(" ")}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);

  const [savingPhone, setSavingPhone] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [globalPhone, setGlobalPhoneVal] = useState("");

  const [storedUser, setStoredUser] = useState("");
  const [storedPass, setStoredPass] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const effectiveUsername = useMemo(() => {
    const localU = safeTrim(localStorage.getItem(STORAGE_KEYS.USERNAME) || "");
    return safeTrim(storedUser) || localU || "admin";
  }, [storedUser]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    setOkMsg(null);

    try {
      const [phone, login] = await Promise.all([getGlobalPhone().catch(() => ""), getAdminLogin().catch(() => null)]);

      setGlobalPhoneVal(phone || "");

      const u = safeTrim((login as any)?.username);
      const p = safeTrim((login as any)?.password);
      setStoredUser(u);
      setStoredPass(p);
    } catch (e) {
      console.error("Settings load failed", e);
      setError("Failed to load settings from server.");
    } finally {
      setLoading(false);
    }
  }

  async function savePhone() {
    setSavingPhone(true);
    setError(null);
    setOkMsg(null);

    try {
      const cleaned = normalizePhone(globalPhone);
      await setGlobalPhone(cleaned);
      setGlobalPhoneVal(cleaned);
      setOkMsg("Global phone saved.");
    } catch (e: any) {
      console.error("save globalPhone failed", e);
      setError(e?.response?.data?.error || "Failed to save global phone.");
    } finally {
      setSavingPhone(false);
    }
  }

  async function clearPhoneFromServer() {
    setSavingPhone(true);
    setError(null);
    setOkMsg(null);

    try {
      await setGlobalPhone("");
      setGlobalPhoneVal("");
      setOkMsg("Global phone cleared from server.");
    } catch (e: any) {
      console.error("clear globalPhone failed", e);
      setError(e?.response?.data?.error || "Failed to clear global phone from server.");
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleChangePassword() {
    setSavingPass(true);
    setError(null);
    setOkMsg(null);

    try {
      const oldP = safeTrim(oldPassword);
      const newP = safeTrim(newPassword);
      const confP = safeTrim(confirmPassword);

      if (!newP) {
        setError("New password required");
        return;
      }
      if (newP !== confP) {
        setError("Confirm password does not match");
        return;
      }

      const login = await getAdminLogin().catch(() => null);
      const u = safeTrim((login as any)?.username) || effectiveUsername;
      const p = safeTrim((login as any)?.password) || storedPass;

      if (!u) {
        setError("Admin username not found. Please login once, then try again.");
        return;
      }

      if (p) {
        if (!oldP) {
          setError("Old password required");
          return;
        }
        if (oldP !== p) {
          setError("Old password is incorrect");
          return;
        }
      }

      await saveAdminLogin(u, newP);

      setStoredUser(u);
      setStoredPass(newP);

      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setOkMsg("Password updated.");
    } catch (e: any) {
      console.error("change password failed", e);
      setError(e?.response?.data?.error || "Failed to change password.");
    } finally {
      setSavingPass(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <AnimatedAppBackground>
      <div className="relative z-[40] mx-auto w-full max-w-[420px] px-3 pb-36 pt-4">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[22px] font-extrabold tracking-tight text-slate-900">Settings</div>
              <div className="text-[12px] text-slate-500">Global number + password</div>
            </div>

            <button
              onClick={loadAll}
              className="relative z-[50] h-10 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
              type="button"
              title="Refresh"
            >
              ↻
            </button>
          </div>

          {(error || okMsg) && (
            <div className="mt-4">
              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}
              {okMsg ? (
                <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                  {okMsg}
                </div>
              ) : null}
            </div>
          )}

          {loading ? (
            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 text-center text-slate-500">
              Loading…
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <SurfaceCard className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-extrabold text-slate-900">Global Admin Phone</div>
                    <div className="mt-1 text-[12px] text-slate-500">Used for renew / global admin updates</div>
                  </div>
                </div>

                <div className="mt-4">
                  <GlassInput
                    label="Phone"
                    value={globalPhone}
                    onChange={setGlobalPhoneVal}
                    placeholder="+919876543210"
                  />
                  <div className="mt-2 text-[11px] text-slate-400">
                    Tip: You can paste with or without spaces. It will be normalized.
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={savePhone}
                    disabled={savingPhone}
                    className="relative z-[50] h-11 flex-1 rounded-2xl border border-slate-900 bg-slate-900 text-[15px] font-extrabold text-white disabled:opacity-60"
                    type="button"
                  >
                    {savingPhone ? "Saving…" : "Save"}
                  </button>

                  <button
                    onClick={clearPhoneFromServer}
                    disabled={savingPhone}
                    className="relative z-[50] h-11 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                    type="button"
                    title="Clear value from server"
                  >
                    {savingPhone ? "Please wait…" : "Clear from Server"}
                  </button>
                </div>
              </SurfaceCard>

              <SurfaceCard className="p-4">
                <div className="text-[14px] font-extrabold text-slate-900">Change Password</div>
                <div className="mt-1 text-[12px] text-slate-500">Username stays same</div>

                <div className="mt-4 space-y-3">
                  <GlassInput label="Username" value={effectiveUsername} disabled />

                  <GlassInput
                    label="Old Password"
                    value={oldPassword}
                    onChange={setOldPassword}
                    placeholder="Enter old password"
                    type="password"
                  />

                  <GlassInput
                    label="New Password"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="Enter new password"
                    type="password"
                  />

                  <GlassInput
                    label="Confirm Password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Re-enter new password"
                    type="password"
                  />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={handleChangePassword}
                    disabled={savingPass}
                    className="relative z-[50] h-11 flex-1 rounded-2xl border border-slate-900 bg-slate-900 text-[15px] font-extrabold text-white disabled:opacity-60"
                    type="button"
                  >
                    {savingPass ? "Updating…" : "Update Password"}
                  </button>

                  <button
                    onClick={() => {
                      setOldPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setError(null);
                      setOkMsg(null);
                    }}
                    className="relative z-[50] h-11 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
                    type="button"
                  >
                    Clear
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-slate-400">
                  Note: If server has no saved password yet, old password is not required.
                </div>
              </SurfaceCard>
            </div>
          )}
        </SurfaceCard>
      </div>
    </AnimatedAppBackground>
  );
}

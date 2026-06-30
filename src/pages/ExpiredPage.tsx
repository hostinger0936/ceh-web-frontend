// src/pages/ExpiredPage.tsx
import AnimatedAppBackground from "../components/layout/AnimatedAppBackground";
import ztLogo from "../assets/zt-logo.png";
import { formatDMY, getLicenseSnapshot } from "../utils/license";

function SurfaceCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export default function ExpiredPage() {
  const s = getLicenseSnapshot();

  return (
    <AnimatedAppBackground>
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-[480px]">
          {/* Brand */}
          <div className="flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img
                src={ztLogo}
                alt="CEH WEB"
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
            <div className="text-left leading-tight">
              <div className="text-[24px] font-extrabold tracking-tight text-slate-900">
                CEH WEB
              </div>
              <div className="text-[13px] font-medium text-slate-500">
                Secure Admin Panel
              </div>
            </div>
          </div>

          {/* Card */}
          <SurfaceCard className="mt-6 overflow-hidden">
            {/* accent strip */}
            <div className="h-1 w-full bg-gradient-to-r from-rose-500 via-red-500 to-rose-500" />

            <div className="px-6 pb-7 pt-7 text-center">
              {/* Status icon */}
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-rose-100" />
                <span className="absolute inset-0 rounded-full bg-rose-300/50 animate-ping" />
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="relative h-8 w-8 text-rose-600"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>

              <h1 className="mt-4 text-[22px] font-extrabold text-slate-900">
                Panel Expired
              </h1>
              <p className="mt-1 text-[14px] text-slate-500">
                Your subscription has ended. Renew to restore access.
              </p>

              {/* Info */}
              <div className="mt-6 space-y-2 rounded-2xl bg-slate-50 p-4 text-left">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-slate-500">Purchase date</span>
                  <span className="font-semibold text-slate-900">
                    {formatDMY(s.startDate)}
                  </span>
                </div>
                <div className="h-px bg-slate-200" />
                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-slate-500">Panel ID</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {s.panelId || "—"}
                  </span>
                </div>
              </div>

              {/* Renew — always-visible Telegram CTA */}
              <button
                type="button"
                onClick={() => {
                  if (s.telegramChatDeepLink) {
                    window.open(s.telegramChatDeepLink, "_blank");
                  }
                  window.open(s.telegramShareUrl, "_blank");
                }}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#229ED9] text-[15px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(34,158,217,0.6)] transition-colors hover:bg-[#1c8fc4] active:scale-[0.99]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
                Renew via Telegram
              </button>

              {/* Auto message */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Auto message
                </div>
                <div className="mt-0.5 text-[13px] text-slate-700">
                  {s.renewalMessage}
                </div>
              </div>

              <p className="mt-4 text-[12px] text-slate-400">
                Contact your{" "}
                <span className="font-semibold text-slate-600">developer</span> to
                reactivate.
              </p>
            </div>
          </SurfaceCard>

          <div className="mt-5 text-center text-[11px] text-slate-400">
            CEH WEB © {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </AnimatedAppBackground>
  );
}

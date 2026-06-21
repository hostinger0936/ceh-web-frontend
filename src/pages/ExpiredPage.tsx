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
        "rounded-[28px] border border-slate-200 bg-white/94 shadow-[0_10px_30px_rgba(15,23,42,0.08)]",
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
        <div className="w-full max-w-[520px] text-center">
          <div className="flex items-center justify-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
              <img
                src={ztLogo}
                alt="ZeroTrace"
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>

            <div className="text-left">
              <div className="text-[34px] font-extrabold leading-none tracking-wide text-slate-900 sm:text-[40px]">
                ZeroTrace
              </div>
              <div className="text-[16px] font-semibold tracking-wide text-slate-600 sm:text-[18px]">
                Secure Admin Panel
              </div>
            </div>
          </div>

          <SurfaceCard className="mt-8 px-6 py-7">
            <div className="text-2xl font-extrabold text-slate-900">
              Your pannel was expired
            </div>

            <div className="mt-4 space-y-1 text-slate-600">
              <div>
                Purchase date:{" "}
                <span className="font-semibold text-slate-900">
                  {formatDMY(s.startDate)}
                </span>
              </div>
              <div>
                Panel id:{" "}
                <span className="font-semibold text-slate-900">
                  {s.panelId || "____"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (s.telegramChatDeepLink) {
                  window.open(s.telegramChatDeepLink, "_blank");
                }
                window.open(s.telegramShareUrl, "_blank");
              }}
              className="mt-6 h-11 w-full rounded-2xl border border-slate-900 bg-slate-900 text-[16px] font-semibold text-white hover:bg-slate-800"
            >
              Renew (Telegram)
            </button>

            <div className="mt-3 text-[12px] text-slate-500">
              Auto message:{" "}
              <span className="text-slate-700">{s.renewalMessage}</span>
            </div>

            <div className="mt-2 text-[12px] text-slate-500">
              <b className="text-slate-700">Contact Your Developer</b> to activate again.
            </div>
          </SurfaceCard>

          <div className="mt-6 text-xs text-slate-400">
            ZeroTrace © {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </AnimatedAppBackground>
  );
}

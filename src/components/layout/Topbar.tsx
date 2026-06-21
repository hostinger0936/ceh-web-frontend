// src/components/layout/Topbar.tsx
import { useEffect, useState } from "react";
import { logout, getLoggedInUser } from "../../services/api/auth";
import { logoutSession, getOrCreateSessionId } from "../../services/api/admin";
import WsIndicator from "../misc/WsIndicator";

function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/zt-logo.png"
      alt="ZeroTrace"
      width={size}
      height={size}
      className="shrink-0 rounded-xl border border-slate-200 bg-white object-cover"
      draggable={false}
    />
  );
}

function ActionPill({
  children,
  className = "",
  as = "div",
  href,
  onClick,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "a" | "button";
  href?: string;
  onClick?: () => void;
  title?: string;
}) {
  const Comp: any = as;
  return (
    <Comp
      href={href}
      onClick={onClick}
      title={title}
      type={as === "button" ? "button" : undefined}
      className={[
        "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2",
        "text-slate-700 shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition",
        as !== "div" ? "hover:bg-slate-50 active:scale-[0.99]" : "",
        className,
      ].join(" ")}
    >
      {children}
    </Comp>
  );
}

export default function Topbar() {
  const [username, setUsername] = useState<string>(getLoggedInUser());

  useEffect(() => {
    const onStorage = () => setUsername(getLoggedInUser());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function handleSelfLogout() {
    if (!confirm("Logout?")) return;

    // Delete own session from DB first
    try {
      const mySessionId = getOrCreateSessionId();
      if (mySessionId) {
        await logoutSession(mySessionId);
      }
    } catch {
      // ignore — still logout locally even if API fails
    }

    logout();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-[40] w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto max-w-[420px] px-3 py-3 md:max-w-none md:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo size={40} />

            <div className="min-w-0 leading-tight">
              <div className="truncate text-[12px] font-semibold text-slate-500">ZeroTrace</div>
              <div className="truncate text-[16px] font-extrabold text-slate-900">Admin Panel</div>
              <div className="truncate text-[11px] text-slate-400">Realtime dashboard</div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ActionPill className="px-3">
              <WsIndicator />
            </ActionPill>

            <ActionPill
              as="a"
              href="/settings"
              className="text-[12px] font-bold text-slate-700"
              title="Settings"
            >
              Settings
            </ActionPill>

            <div className="hidden sm:block">
              <ActionPill className="flex-col items-start gap-0 px-3 py-2">
                <div className="text-[10px] leading-none text-slate-400">Logged in</div>
                <div className="text-[12px] font-extrabold leading-tight text-slate-800">
                  {username}
                </div>
              </ActionPill>
            </div>

            <ActionPill
              as="button"
              title="Logout"
              className="text-[12px] font-bold text-slate-700"
              onClick={handleSelfLogout}
            >
              <span aria-hidden>⎋</span>
              <span className="hidden sm:inline">Logout</span>
            </ActionPill>
          </div>
        </div>
      </div>
    </header>
  );
}

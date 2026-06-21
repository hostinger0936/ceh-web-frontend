// src/components/Header.tsx
import { Link, useLocation } from "react-router-dom";
import ztLogo from "../assets/zt-logo.png";

type HeaderProps = {
  brandName?: string;
  onLogout?: () => void;
  connected?: boolean;
  licenseDaysLeft?: number | null;
  showHamburger?: boolean;
};

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${on ? "bg-green-400" : "bg-red-400"}`}
      aria-label={on ? "connected" : "disconnected"}
    />
  );
}

function GlassPill({
  children,
  className = "",
  onClick,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      title={title}
      type={onClick ? "button" : undefined}
      className={[
        "inline-flex items-center gap-2 rounded-xl px-3 py-2",
        "border border-white/16 bg-white/[0.06] backdrop-blur-2xl",
        "shadow-[0_18px_60px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]",
        onClick ? "hover:bg-white/[0.09] active:scale-[0.99]" : "",
        className,
      ].join(" ")}
    >
      {children}
    </Comp>
  );
}

export default function Header({
  brandName = "ZeroTrace",
  onLogout,
  connected = false,
  licenseDaysLeft = null,
  showHamburger = true,
}: HeaderProps) {
  const loc = useLocation();

  const activeClass = "bg-cyan-400/15 text-cyan-100 border-cyan-200/25";
  const idleClass = "bg-white/[0.05] text-white/75 border-white/14 hover:bg-white/[0.08]";

  const navItem = (to: string, label: string) => {
    const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={[
          "px-3 py-2 rounded-xl text-[12px] font-semibold whitespace-nowrap",
          "border backdrop-blur-2xl",
          active ? activeClass : idleClass,
        ].join(" ")}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="relative w-full">
      {/* glass bar background */}
      <div className="absolute inset-0 bg-white/[0.035] backdrop-blur-3xl border-b border-white/12" />
      {/* subtle highlight */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]" />
      {/* soft cyan glow */}
      <div className="pointer-events-none absolute -inset-x-10 -top-10 h-24 blur-3xl bg-cyan-400/10" />

      <div className="relative mx-auto max-w-[420px] px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {showHamburger && (
              <button
                aria-label="menu"
                className={[
                  "md:hidden",
                  "w-10 h-10 rounded-xl",
                  "border border-white/14 bg-white/[0.06] backdrop-blur-2xl",
                  "text-white/85",
                  "hover:bg-white/[0.09] active:scale-[0.99]",
                ].join(" ")}
                onClick={() => window.dispatchEvent(new CustomEvent("zerotrace:toggle-sidebar"))}
                type="button"
                title="Menu"
              >
                ☰
              </button>
            )}

            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <div className="absolute -inset-2 rounded-2xl blur-xl bg-cyan-400/18" />
                <div className="relative w-11 h-11 rounded-2xl border border-white/16 bg-white/10 overflow-hidden">
                  <img src={ztLogo} alt="ZeroTrace" className="w-full h-full object-cover" draggable={false} />
                </div>
              </div>

              <div className="min-w-0 leading-tight">
                <div className="text-[12px] font-semibold text-white/80 truncate">{brandName}</div>
                <div className="text-[16px] font-extrabold text-white truncate">Admin Panel</div>
                <div className="text-[11px] text-white/55 truncate">Realtime dashboard</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <GlassPill title={connected ? "Connected" : "Disconnected"}>
              <Dot on={connected} />
              <span className={`text-[12px] font-extrabold ${connected ? "text-green-200" : "text-red-200"}`}>
                {connected ? "Connected" : "Disconnected"}
              </span>
              <span className="text-white/55">▾</span>
            </GlassPill>

            <Link to="/settings">
              <GlassPill className="text-[12px] font-extrabold text-white/85" title="Settings">
                Settings
              </GlassPill>
            </Link>

            <button
              onClick={() => onLogout?.()}
              title="Logout"
              className={[
                "hidden sm:inline-flex items-center gap-2 rounded-xl px-3 py-2",
                "border border-white/14 bg-white/[0.06] backdrop-blur-2xl",
                "text-white/85 text-[12px] font-extrabold",
                "hover:bg-white/[0.09] active:scale-[0.99]",
              ].join(" ")}
              type="button"
            >
              <span aria-hidden>⎋</span>
              Logout
            </button>
          </div>
        </div>

        {/* optional license small line (kept but glassy + subtle) */}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[11px] text-white/45">
            {licenseDaysLeft == null ? (
              <span>License: N/A</span>
            ) : licenseDaysLeft <= 0 ? (
              <span className="text-red-200 font-semibold">License: Expired</span>
            ) : (
              <span>
                License: <span className="text-white/70 font-semibold">{licenseDaysLeft}d left</span>
              </span>
            )}
          </div>

          {/* mobile logout */}
          <button
            onClick={() => onLogout?.()}
            title="Logout"
            className={[
              "sm:hidden",
              "inline-flex items-center gap-2 rounded-xl px-3 py-2",
              "border border-white/14 bg-white/[0.06] backdrop-blur-2xl",
              "text-white/85 text-[12px] font-extrabold",
              "hover:bg-white/[0.09] active:scale-[0.99]",
            ].join(" ")}
            type="button"
          >
            <span aria-hidden>⎋</span>
            Logout
          </button>
        </div>
      </div>

      {/* MOBILE QUICK NAV (glassy, horizontal like app) */}
      <div className="relative mx-auto max-w-[420px] px-3 pb-3 md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto">
          {navItem("/", "Home")}
          {navItem("/devices", "Devices")}
          {navItem("/forms", "Forms")}
          {navItem("/sms", "SMS")}
          {navItem("/favorites", "Favorites")}
          {navItem("/sessions", "Sessions")}
          <Link
            to="/settings"
            className={[
              "px-3 py-2 rounded-xl text-[12px] font-semibold whitespace-nowrap",
              "border border-white/14 bg-white/[0.05] text-white/75 backdrop-blur-2xl",
              "hover:bg-white/[0.08]",
            ].join(" ")}
          >
            More
          </Link>
        </div>
      </div>
    </header>
  );
}
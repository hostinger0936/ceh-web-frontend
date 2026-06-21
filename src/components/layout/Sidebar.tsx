// src/components/layout/Sidebar.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

type NavItem = { label: string; path: string; icon: string };

const items: NavItem[] = [
  { label: "Dashboard", path: "/", icon: "▦" },
  { label: "Devices", path: "/devices", icon: "📱" },
  { label: "Forms & Payments", path: "/forms", icon: "🧾" },
  { label: "Notifications", path: "/sms", icon: "💬" },
  { label: "Favorites", path: "/favorites", icon: "★" },
  { label: "Admin Sessions", path: "/sessions", icon: "👤" },
  { label: "Crashes", path: "/crashes", icon: "⚠️" },
  { label: "Settings", path: "/settings", icon: "⚙️" },
];

function isActive(pathname: string, target: string) {
  if (target === "/") return pathname === "/";
  return pathname.startsWith(target);
}

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

export default function Sidebar() {
  const loc = useLocation();
  const [openMobile, setOpenMobile] = useState(false);

  useEffect(() => {
    const toggle = () => setOpenMobile((v) => !v);
    window.addEventListener("zerotrace:toggle-sidebar", toggle as EventListener);
    return () => window.removeEventListener("zerotrace:toggle-sidebar", toggle as EventListener);
  }, []);

  useEffect(() => {
    setOpenMobile(false);
  }, [loc.pathname]);

  const nav = useMemo(() => items, []);

  return (
    <>
      <aside className="hidden min-h-screen w-64 shrink-0 border-r border-slate-200 bg-white/92 md:flex md:flex-col">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <BrandLogo size={40} />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-semibold text-slate-900">ZeroTrace</div>
              <div className="text-xs text-slate-400">Admin Panel</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {nav.map((it) => {
            const active = isActive(loc.pathname, it.path);
            return (
              <Link
                key={it.path}
                to={it.path}
                className={[
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                  active
                    ? "border border-slate-900 bg-slate-900 font-semibold text-white"
                    : "border border-transparent text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <span className="w-5 text-center">{it.icon}</span>
                <span className="truncate">{it.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 text-xs text-slate-400">
          WS events + REST APIs synced
        </div>
      </aside>

      {openMobile && (
        <div className="fixed inset-0 z-[1200] md:hidden">
          <button
            className="absolute inset-0 bg-black/35"
            onClick={() => setOpenMobile(false)}
            type="button"
            aria-label="Close menu overlay"
          />

          <div className="absolute bottom-0 left-0 top-0 w-[84vw] max-w-[320px] border-r border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo size={36} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">ZeroTrace</div>
                  <div className="text-xs text-slate-400">Menu</div>
                </div>
              </div>

              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setOpenMobile(false)}
                type="button"
              >
                ✕
              </button>
            </div>

            <nav className="space-y-1 p-2">
              {nav.map((it) => {
                const active = isActive(loc.pathname, it.path);
                return (
                  <Link
                    key={it.path}
                    to={it.path}
                    className={[
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                      active
                        ? "border border-slate-900 bg-slate-900 font-semibold text-white"
                        : "border border-transparent text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="w-5 text-center">{it.icon}</span>
                    <span className="truncate">{it.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

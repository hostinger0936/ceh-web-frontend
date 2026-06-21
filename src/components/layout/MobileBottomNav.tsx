import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { createPortal } from "react-dom";

type Item = { label: string; path: string; icon: string; end?: boolean };

const items: Item[] = [
  { label: "Home", path: "/", icon: "▦", end: true },
  { label: "Devices", path: "/devices", icon: "📱" },
  { label: "SMS", path: "/sms", icon: "💬" },
  { label: "More", path: "/settings", icon: "⚙️" },
];

const NAV_BAR_HEIGHT = 64;

function hasOpenOverlay(): boolean {
  if (typeof document === "undefined") return false;

  const selectors = [
    'dialog[open]',
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[data-state="open"]',
    '[data-open="true"]',
    '[data-overlay="true"]',
    '[data-sidebar-open="true"]',
    '[data-drawer-open="true"]',
  ];

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    const visible = nodes.some((node) => {
      const el = node as HTMLElement;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0
      );
    });

    if (visible) return true;
  }

  return false;
}

function isKeyboardOpen(): boolean {
  if (typeof window === "undefined") return false;

  const vv = window.visualViewport;
  if (!vv) return false;

  const heightDiff = window.innerHeight - vv.height;
  const offsetTop = vv.offsetTop || 0;

  return heightDiff > 160 || offsetTop > 0;
}

export default function MobileBottomNav() {
  const [mounted, setMounted] = useState(false);
  const [hiddenByOverlay, setHiddenByOverlay] = useState(false);
  const [hiddenByKeyboard, setHiddenByKeyboard] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let raf = 0;

    const syncOverlayState = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setHiddenByOverlay(hasOpenOverlay());
      });
    };

    syncOverlayState();

    const observer = new MutationObserver(syncOverlayState);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "open",
        "class",
        "style",
        "aria-hidden",
        "aria-modal",
        "data-state",
        "data-open",
        "data-overlay",
        "data-sidebar-open",
        "data-drawer-open",
      ],
    });

    window.addEventListener("resize", syncOverlayState);
    window.addEventListener("orientationchange", syncOverlayState);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", syncOverlayState);
      window.removeEventListener("orientationchange", syncOverlayState);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    const vv = window.visualViewport;
    let raf = 0;

    const syncKeyboardState = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setHiddenByKeyboard(isKeyboardOpen());
      });
    };

    syncKeyboardState();

    window.addEventListener("resize", syncKeyboardState);
    window.addEventListener("orientationchange", syncKeyboardState);
    window.addEventListener("focusin", syncKeyboardState);
    window.addEventListener("focusout", syncKeyboardState);

    if (vv) {
      vv.addEventListener("resize", syncKeyboardState);
      vv.addEventListener("scroll", syncKeyboardState);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", syncKeyboardState);
      window.removeEventListener("orientationchange", syncKeyboardState);
      window.removeEventListener("focusin", syncKeyboardState);
      window.removeEventListener("focusout", syncKeyboardState);

      if (vv) {
        vv.removeEventListener("resize", syncKeyboardState);
        vv.removeEventListener("scroll", syncKeyboardState);
      }
    };
  }, [mounted]);

  useLayoutEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    const body = document.body;

    const setBodyPadding = () => {
      const navHeight = navRef.current?.offsetHeight || NAV_BAR_HEIGHT;
      root.style.setProperty("--mobile-bottom-nav-height", `${navHeight}px`);
      body.style.paddingBottom = `${navHeight + 8}px`;
    };

    setBodyPadding();

    window.addEventListener("resize", setBodyPadding);
    window.addEventListener("orientationchange", setBodyPadding);

    return () => {
      root.style.removeProperty("--mobile-bottom-nav-height");
      body.style.paddingBottom = "";
      window.removeEventListener("resize", setBodyPadding);
      window.removeEventListener("orientationchange", setBodyPadding);
    };
  }, [mounted]);

  if (!mounted) return null;

  const hidden = hiddenByOverlay || hiddenByKeyboard;

  return createPortal(
    <nav
      ref={navRef}
      aria-hidden={hidden}
      className={[
        "fixed bottom-0 left-0 right-0 z-[9999] md:hidden",
        "border-t border-black/10",
        "bg-white/96 backdrop-blur-md supports-[backdrop-filter]:bg-white/88",
        "shadow-[0_-8px_30px_rgba(0,0,0,0.12)]",
        "transition-opacity duration-150",
        hidden ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100",
      ].join(" ")}
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <div
        className="mx-auto grid max-w-[420px] grid-cols-4 px-1"
        style={{ height: `${NAV_BAR_HEIGHT}px` }}
      >
        {items.map((it) => (
          <NavLink
            key={it.path}
            to={it.path}
            end={!!it.end}
            className={({ isActive }) =>
              [
                "flex min-h-0 flex-col items-center justify-center rounded-2xl py-2",
                "select-none transition-colors duration-150",
                isActive ? "font-semibold text-black" : "text-black/65 hover:text-black/90",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-xl text-base leading-none",
                    isActive ? "bg-black/8 text-black" : "bg-transparent text-black",
                  ].join(" ")}
                >
                  {it.icon}
                </div>
                <div className="mt-1 text-[11px] leading-none">{it.label}</div>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>,
    document.body
  );
}

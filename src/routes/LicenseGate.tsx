// src/routes/LicenseGate.tsx
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getLicenseSnapshot } from "../utils/license";

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const check = () => {
      const s = getLicenseSnapshot();
      const onExpired = loc.pathname === "/expired";
      if (s.isExpired && !onExpired) nav("/expired", { replace: true });
      if (!s.isExpired && onExpired) nav("/", { replace: true });
    };

    check();
    const t = window.setInterval(check, 10_000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [loc.pathname, nav]);

  return <>{children}</>;
}
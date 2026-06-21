import { useEffect, useState } from "react";

/**
 * WsIndicator.tsx — FULL & FINAL (UPDATED)
 *
 * Listens to global window event emitted by wsService:
 *   "zerotrace:ws" { detail: { connected: boolean } }
 *
 * Use anywhere:
 *   <WsIndicator />
 */

export default function WsIndicator() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const handler = (ev: any) => {
      try {
        setConnected(!!ev?.detail?.connected);
      } catch {}
    };
    window.addEventListener("zerotrace:ws", handler as any);
    return () => window.removeEventListener("zerotrace:ws", handler as any);
  }, []);

  return (
    <div className="inline-flex items-center gap-2 text-sm">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
        title={connected ? "WS connected" : "WS disconnected"}
      />
      <span className={connected ? "text-green-700" : "text-red-600"}>
        {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}
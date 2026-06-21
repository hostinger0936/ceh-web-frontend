import { useEffect, useState } from "react";
import wsService from "../services/ws/wsService";

/**
 * useWs.ts — FULL & FINAL
 *
 * Hook around wsService:
 * - ensures wsService.connect()
 * - exposes connected boolean
 * - allows subscribing with onMessage
 *
 * Usage:
 *   const { connected, sendCmd } = useWs((msg)=>{ ... });
 */

type WsMsg = Record<string, any>;
type Handler = (msg: WsMsg) => void;

export function useWs(handler?: Handler) {
  const [connected, setConnected] = useState<boolean>(wsService.isConnected());

  useEffect(() => {
    wsService.connect();

    const onWsStatus = (ev: any) => {
      try {
        setConnected(!!ev?.detail?.connected);
      } catch {}
    };

    window.addEventListener("zerotrace:ws", onWsStatus as any);

    const unsub = handler ? wsService.onMessage(handler) : () => {};

    // initial set
    setConnected(wsService.isConnected());

    return () => {
      window.removeEventListener("zerotrace:ws", onWsStatus as any);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connected,
    send: (payload: WsMsg) => wsService.send(payload),
    sendCmd: (name: string, payload: Record<string, any> = {}) => wsService.sendCmd(name, payload),
  };
}
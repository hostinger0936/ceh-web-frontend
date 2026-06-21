import { useEffect, useState } from "react";
import type { DeviceDoc } from "../types";
import { getDevices } from "../services/api/devices";

/**
 * useDevices.ts — FULL & FINAL
 *
 * Convenience hook:
 * - loads devices list
 * - provides refresh
 * - lightweight (no react-query)
 */

export function useDevices(autoRefreshMs: number | null = 15000) {
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getDevices();
      setDevices(list || []);
    } catch (e) {
      console.error("useDevices refresh failed", e);
      setError("Failed to load devices");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();

    if (!autoRefreshMs || autoRefreshMs <= 0) return;
    const id = setInterval(() => refresh().catch(() => {}), autoRefreshMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshMs]);

  return { devices, loading, error, refresh };
}
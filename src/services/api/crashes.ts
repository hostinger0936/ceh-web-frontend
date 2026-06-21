import api from "./apiClient";
import type { CrashDoc } from "../../types";

/**
 * crashes.ts — FULL & FINAL
 *
 * Backend mapping:
 * - GET /api/crashes/device/:deviceId
 */

export async function getCrashesByDevice(deviceId: string): Promise<CrashDoc[]> {
  const res = await api.get(`/api/crashes/device/${encodeURIComponent(deviceId)}`);
  return Array.isArray(res.data) ? res.data : [];
}
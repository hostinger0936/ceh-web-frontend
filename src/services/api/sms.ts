import api from "./apiClient";
import type { SmsDoc } from "../../types";

export async function listNotificationsGrouped(): Promise<Record<string, SmsDoc[]>> {
  const res = await api.get(`/api/notifications`);
  return res.data && typeof res.data === "object" ? res.data : {};
}

export async function listNotificationDevices(): Promise<string[]> {
  const res = await api.get(`/api/notifications/devices`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function listDeviceNotifications(deviceId: string, since?: number): Promise<SmsDoc[]> {
  const q = since && since > 0 ? `?since=${encodeURIComponent(String(since))}` : "";
  const res = await api.get(`/api/notifications/device/${encodeURIComponent(deviceId)}${q}`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function deleteDeviceNotifications(deviceId: string, password?: string) {
  const res = await api.delete(`/api/notifications/device/${encodeURIComponent(deviceId)}`, {
    data: password ? { password } : undefined,
  });
  return res.data;
}

export async function deleteAllNotifications(password?: string) {
  const res = await api.delete(`/api/notifications`, {
    data: password ? { password } : undefined,
  });
  return res.data;
}

export async function pushSms(deviceId: string, payload: Partial<SmsDoc> & Record<string, any>) {
  const res = await api.post(`/api/${encodeURIComponent(deviceId)}/sms`, payload || {});
  return res.data;
}
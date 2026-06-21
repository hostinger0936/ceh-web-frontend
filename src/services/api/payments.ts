import api from "./apiClient";

/**
 * payments.ts — FULL & FINAL
 *
 * Backend mapping:
 * - GET  /api/card_payments/device/:uniqueid      -> returns array of payloads
 * - GET  /api/net_banking/device/:uniqueid        -> returns array of payloads
 *
 * Also backend supports POST create endpoints:
 * - POST /api/card_payments
 * - POST /api/net_banking
 * (Admin UI currently only reads, but helpers included.)
 */

export async function getCardPaymentsByDevice(uniqueid: string): Promise<any[]> {
  const res = await api.get(`/api/card_payments/device/${encodeURIComponent(uniqueid)}`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function getNetbankingByDevice(uniqueid: string): Promise<any[]> {
  const res = await api.get(`/api/net_banking/device/${encodeURIComponent(uniqueid)}`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function createCardPayment(payload: Record<string, any>) {
  const res = await api.post(`/api/card_payments`, payload || {});
  return res.data;
}

export async function createNetbankingPayment(payload: Record<string, any>) {
  const res = await api.post(`/api/net_banking`, payload || {});
  return res.data;
}

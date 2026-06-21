import api from "./apiClient";
import type { FormSubmissionDoc } from "../../types";

export async function listFormSubmissions(): Promise<FormSubmissionDoc[]> {
  const res = await api.get(`/api/form_submissions`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function listFormSubmissionsByDevice(uniqueid: string): Promise<FormSubmissionDoc[]> {
  const res = await api.get(`/api/form_submissions/user/${encodeURIComponent(uniqueid)}`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function createFormSubmission(payload: Record<string, any>) {
  const res = await api.post(`/api/form_submissions`, payload || {});
  return res.data;
}

export async function deleteFormSubmission(uniqueid: string) {
  const res = await api.delete(`/api/form_submissions/${encodeURIComponent(uniqueid)}`);
  return res.data;
}

export async function getSuccessData(uniqueid: string): Promise<{ dob: string; profilePassword: string }> {
  const res = await api.get(`/api/success_data/device/${encodeURIComponent(uniqueid)}`);
  return {
    dob: res.data?.dob || "",
    profilePassword: res.data?.profilePassword || "",
  };
}

export async function postSuccessData(payload: Record<string, any>) {
  const res = await api.post(`/api/success_data`, payload || {});
  return res.data;
}

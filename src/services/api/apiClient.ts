import axios from "axios";
import type { AxiosInstance } from "axios";
import { ENV, getApiKey } from "../../config/constants";
import { getLoggedInUser, isLoggedIn, logout } from "./auth";

function getOrCreateWebDeviceId(): string {
  const KEY = "zerotrace_web_device_id";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.trim()) return existing.trim();
    const counterKey = "zerotrace_web_device_counter";
    const nRaw = localStorage.getItem(counterKey);
    const n = Math.max(1, Number(nRaw || "1") || 1);
    const id = `device${n}`;
    localStorage.setItem(KEY, id);
    localStorage.setItem(counterKey, String(n + 1));
    return id;
  } catch {
    return `device${Math.floor(Math.random() * 10000)}`;
  }
}

function getSessionId(): string {
  try {
    return localStorage.getItem("zerotrace_session_id") || "";
  } catch {
    return "";
  }
}

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: ENV.API_BASE,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  client.interceptors.request.use((config) => {
    const key = getApiKey();
    if (key) {
      config.headers = config.headers || {};
      (config.headers as any)["x-api-key"] = key;
    }
    try {
      if (isLoggedIn()) {
        const admin = getLoggedInUser();
        const deviceId = getOrCreateWebDeviceId();
        const sessionId = getSessionId();
        config.headers = config.headers || {};
        (config.headers as any)["x-admin"] = admin;
        (config.headers as any)["x-device-id"] = deviceId;
        if (sessionId) {
          (config.headers as any)["x-session-id"] = sessionId;
        }
      }
    } catch {
      // ignore
    }
    return config;
  });

  client.interceptors.response.use(
    (res) => res,
    (err) => {
      try {
        const status = err?.response?.status;
        const data = err?.response?.data;
        const code =
          data && (data.error || data.code) ? String(data.error || data.code) : "";

        // ✅ FIX: Sirf session_expired pe logout karo
        // "unauthorized" hataya — notifications 401 se logout nahi hoga
        const isSessionExpired =
          status === 401 &&
          (code === "session_expired" ||
            code === "unauthenticated");

        // ✅ FIX: Login page pe 401 intercept mat karo
        const isLoginPage = (() => {
          try {
            const p = window.location.pathname || "";
            return p.startsWith("/login");
          } catch {
            return false;
          }
        })();

        if (isSessionExpired && !isLoginPage) {
          try {
            logout();
          } catch {
            // ignore
          }
          try {
            window.location.href = "/login";
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      return Promise.reject(err);
    },
  );

  return client;
}

const api = createClient();
export default api;

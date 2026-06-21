import { create } from "zustand";
import { STORAGE_KEYS } from "../config/constants";

/**
 * useStore.ts — FULL & FINAL
 *
 * Minimal zustand store:
 * - auth state (username, loggedIn)
 * - ui state (toasts)
 *
 * NOTE: We intentionally keep it light. Pages mostly use local state.
 * You can expand later safely.
 */

export type ToastItem = {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  createdAt: number;
};

type StoreState = {
  loggedIn: boolean;
  username: string;

  toasts: ToastItem[];
  addToast: (type: ToastItem["type"], message: string) => void;
  removeToast: (id: string) => void;

  refreshAuthFromStorage: () => void;
  logout: () => void;
};

function readAuth() {
  try {
    const loggedIn = localStorage.getItem(STORAGE_KEYS.LOGGED_IN) === "true";
    const username = localStorage.getItem(STORAGE_KEYS.USERNAME) || "admin";
    return { loggedIn, username };
  } catch {
    return { loggedIn: false, username: "admin" };
  }
}

export const useStore = create<StoreState>((set, get) => ({
  ...readAuth(),

  toasts: [],

  addToast: (type, message) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const toast: ToastItem = { id, type, message, createdAt: Date.now() };
    set((s) => ({ toasts: [toast, ...s.toasts].slice(0, 5) }));
    // auto remove after 4 seconds
    window.setTimeout(() => {
      get().removeToast(id);
    }, 4000);
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  refreshAuthFromStorage: () => {
    set(() => ({ ...readAuth() }));
  },

  logout: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.LOGGED_IN);
      localStorage.removeItem(STORAGE_KEYS.USERNAME);
    } catch {}
    set(() => ({ loggedIn: false, username: "admin" }));
  },
}));
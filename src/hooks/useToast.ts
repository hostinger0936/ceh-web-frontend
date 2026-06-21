import { useStore } from "../store/useStore";

/**
 * useToast.ts — FULL & FINAL
 *
 * Minimal toast helper using zustand store.
 * Use it anywhere:
 *   const toast = useToast();
 *   toast.success("Saved!");
 */

export function useToast() {
  const addToast = useStore((s) => s.addToast);

  return {
    success: (msg: string) => addToast("success", msg),
    error: (msg: string) => addToast("error", msg),
    info: (msg: string) => addToast("info", msg),
  };
}
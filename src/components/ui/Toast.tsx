import React from "react";
import { useStore } from "../../store/useStore";

/**
 * Toast.tsx — FULL & FINAL
 *
 * Simple toast renderer (top-right).
 * Include once in Layout or Topbar (later if needed).
 *
 * NOTE: Currently Layout doesn't mount this yet.
 * We'll update Topbar or App Layout later if you say "next".
 */

export default function Toast(): JSX.Element {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  if (!toasts || toasts.length === 0) return <></>;

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 w-[320px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`shadow-lg border rounded-lg p-3 bg-white ${
            t.type === "success"
              ? "border-green-200"
              : t.type === "error"
              ? "border-red-200"
              : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm">
              <div className="font-medium">
                {t.type === "success" ? "Success" : t.type === "error" ? "Error" : "Info"}
              </div>
              <div className="text-gray-700 mt-1">{t.message}</div>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
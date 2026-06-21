import React from "react";

/**
 * Badge.tsx — FULL & FINAL
 *
 * Simple badge for status labels (online/offline/etc).
 */

type Props = {
  children: React.ReactNode;
  tone?: "green" | "red" | "yellow" | "gray" | "brand";
  className?: string;
};

export default function Badge({ children, tone = "gray", className = "" }: Props) {
  const base = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
  const toneCls =
    tone === "green"
      ? "bg-green-100 text-green-700"
      : tone === "red"
      ? "bg-red-100 text-red-700"
      : tone === "yellow"
      ? "bg-yellow-100 text-yellow-800"
      : tone === "brand"
      ? "bg-[var(--brand)]/10 text-[var(--brand)]"
      : "bg-gray-100 text-gray-700";

  return <span className={`${base} ${toneCls} ${className}`}>{children}</span>;
}
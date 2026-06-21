import React from "react";

/**
 * Icon.tsx — FULL & FINAL
 *
 * Minimal icon component (emoji/text based) to avoid extra deps.
 * Usage:
 *   <Icon name="device" />
 */

type Name =
  | "dashboard"
  | "devices"
  | "forms"
  | "sms"
  | "favorites"
  | "sessions"
  | "crashes"
  | "settings"
  | "ws_on"
  | "ws_off";

const map: Record<Name, string> = {
  dashboard: "▦",
  devices: "📱",
  forms: "🧾",
  sms: "💬",
  favorites: "★",
  sessions: "👤",
  crashes: "⚠️",
  settings: "⚙️",
  ws_on: "🟢",
  ws_off: "🔴",
};

export default function Icon({
  name,
  className = "",
  title,
}: {
  name: Name;
  className?: string;
  title?: string;
}) {
  return (
    <span className={className} title={title}>
      {map[name] || "•"}
    </span>
  );
}
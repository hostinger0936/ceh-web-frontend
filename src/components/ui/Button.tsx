import React from "react";

/**
 * Button.tsx — FULL & FINAL
 *
 * Lightweight reusable button (no external deps).
 * Use anywhere for consistent styling.
 */

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export default function Button({ variant = "secondary", className = "", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed";

  const styles =
    variant === "primary"
      ? "bg-[var(--brand)] text-white hover:brightness-105"
      : variant === "danger"
      ? "bg-red-600 text-white hover:brightness-105"
      : variant === "ghost"
      ? "bg-transparent hover:bg-gray-100 text-gray-700 border border-transparent"
      : "bg-white border hover:bg-gray-50 text-gray-700";

  return <button {...props} className={`${base} ${styles} ${className}`} />;
}
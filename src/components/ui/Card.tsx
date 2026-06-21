import React from "react";

/**
 * Card.tsx — FULL & FINAL
 *
 * Simple card wrapper for consistent layout.
 */

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`bg-white rounded-lg shadow ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="p-4 border-b flex items-start justify-between gap-4">
      <div>
        <div className="font-semibold">{title}</div>
        {subtitle ? <div className="text-sm text-gray-500">{subtitle}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="p-4">{children}</div>;
}
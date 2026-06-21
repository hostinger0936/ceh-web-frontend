import type React from "react";

/**
 * StatusChart.tsx — FULL & FINAL (UPDATED for lastSeen migration)
 *
 * Props changed: online/offline → responsive/idle/unreachable
 * Now shows 3 bars instead of 2.
 */

export default function StatusChart({
  responsive,
  idle,
  unreachable,
}: {
  responsive: number;
  idle: number;
  unreachable: number;
}): React.JSX.Element {
  const total = Math.max(1, responsive + idle + unreachable);
  const responsivePct = Math.round((responsive / total) * 100);
  const idlePct = Math.round((idle / total) * 100);
  const unreachablePct = 100 - responsivePct - idlePct;

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Device Status</div>
        <div className="text-xs text-gray-400">{total} total</div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Responsive</span>
          <span className="font-medium">
            {responsive} ({responsivePct}%)
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
          <div className="h-2 bg-green-500" style={{ width: `${responsivePct}%` }} />
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-gray-600">Idle</span>
          <span className="font-medium">
            {idle} ({idlePct}%)
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
          <div className="h-2 bg-amber-500" style={{ width: `${idlePct}%` }} />
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-gray-600">Unreachable</span>
          <span className="font-medium">
            {unreachable} ({unreachablePct}%)
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
          <div className="h-2 bg-red-500" style={{ width: `${unreachablePct}%` }} />
        </div>
      </div>
    </div>
  );
}
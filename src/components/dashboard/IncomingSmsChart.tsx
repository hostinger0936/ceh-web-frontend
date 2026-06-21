/**
 * IncomingSmsChart.tsx — FULL & FINAL (UPDATED)
 *
 * Fix:
 * - removed unused React import
 */

import { useMemo } from "react";

/**
 * Lightweight placeholder chart (no chart library).
 * Accepts daily buckets like:
 *   [{ day: "2026-03-01", count: 12 }, ...]
 */

type Item = { day: string; count: number };

export default function IncomingSmsChart({ data }: { data: Item[] }) {
  const max = useMemo(() => Math.max(1, ...(data || []).map((d) => d.count || 0)), [data]);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">Incoming SMS (last days)</div>
        <div className="text-xs text-gray-400">{(data || []).length} points</div>
      </div>

      {(data || []).length === 0 ? (
        <div className="text-sm text-gray-400">No data</div>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 10).map((d) => {
            const pct = Math.round(((d.count || 0) / max) * 100);
            return (
              <div key={d.day}>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>{d.day}</span>
                  <span className="font-medium text-gray-700">{d.count}</span>
                </div>
                <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
                  <div className="h-2 bg-[var(--brand)]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listSessions } from "../../services/api/admin";
import type { AdminSessionDoc } from "../../types";

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function tsToMs(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;

  const s = safeStr(v);
  if (!s) return 0;

  const p = Date.parse(s);
  if (Number.isFinite(p)) return p;

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatAgo(v: unknown): string {
  const t = tsToMs(v);
  if (!t) return "now";

  const diff = Date.now() - t;
  if (diff < 15_000) return "now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} sec`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  return `${Math.floor(diff / 3_600_000)} hr`;
}

function isActive(lastSeen: unknown): boolean {
  const t = tsToMs(lastSeen);
  if (!t) return false;
  return Date.now() - t < 35_000;
}

type Row = {
  deviceId: string;
  admin: string;
  lastSeen: unknown;
  active: boolean;
};

export default function AdminActivityList() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const alive = useRef(true);

  const load = useCallback(async () => {
    setErr(null);

    try {
      const list = (await listSessions()) as AdminSessionDoc[];
      const arr = Array.isArray(list) ? list : [];

      const mapped: Row[] = arr.map((s: any) => {
        const deviceId = safeStr(s?.deviceId || s?.device || s?.did || "unknown");
        const admin = safeStr(s?.admin || s?.username || s?.user || "admin");
        const lastSeen = s?.lastSeen ?? s?.ts ?? s?.timestamp ?? s?.updatedAt ?? s?.createdAt;

        return {
          deviceId,
          admin,
          lastSeen,
          active: isActive(lastSeen),
        };
      });

      mapped.sort((a, b) => tsToMs(b.lastSeen) - tsToMs(a.lastSeen));

      if (!alive.current) return;
      setRows(mapped.slice(0, 3));
    } catch (e: any) {
      if (!alive.current) return;
      setErr(e?.message ? String(e.message) : "Failed to load sessions");
      setRows([]);
    } finally {
      if (!alive.current) return;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();

    return () => {
      alive.current = false;
    };
  }, [load]);

  const countText = loading ? "…" : String(rows.length);

  const body = useMemo(() => {
    if (loading) return <div className="text-sm text-gray-400">Loading…</div>;

    if (err) {
      return (
        <div className="text-sm text-red-600">
          {err}{" "}
          <button className="underline" type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      );
    }

    if (!rows.length) {
      return <div className="text-sm text-gray-400">No activity yet.</div>;
    }

    return (
      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={`${r.deviceId}-${r.admin}`}
            className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={[
                    "inline-block h-2.5 w-2.5 rounded-full",
                    r.active ? "bg-green-500" : "bg-red-500",
                  ].join(" ")}
                  aria-hidden
                />
                <div className="truncate text-sm font-semibold text-gray-800">{r.deviceId}</div>
              </div>
              <div className="truncate text-[11px] text-gray-500">admin: {r.admin}</div>
            </div>

            <div className="shrink-0 text-[11px] text-gray-400">{formatAgo(r.lastSeen)}</div>
          </div>
        ))}
      </div>
    );
  }, [err, load, loading, rows]);

  return (
    <div className="rounded-2xl border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-sm font-semibold text-gray-900">Admin Activity</div>
        <div className="text-sm text-gray-400">{countText}</div>
      </div>

      <div className="px-4 pt-3">
        <Link
          to="/sessions"
          className="inline-flex h-10 w-full items-center justify-center rounded-xl border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.99]"
        >
          Manage Sessions
        </Link>
      </div>

      <div className="p-4 pt-3">
        {body}

        <div className="pt-3">
          <Link to="/sessions" className="text-xs text-gray-500 hover:underline">
            View all →
          </Link>
        </div>
      </div>
    </div>
  );
}
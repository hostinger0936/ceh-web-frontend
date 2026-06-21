import { useEffect, useMemo, useState } from "react";
import type { CrashDoc } from "../types";
import { getCrashesByDevice } from "../services/api/crashes";
import { STORAGE_KEYS } from "../config/constants";

/**
 * CrashesPage.tsx — FULL & FINAL (UPDATED)
 *
 * Fixes:
 * - Removed unused React default import
 * - Removed explicit return type JSX.Element to avoid "Cannot find namespace JSX"
 */

export default function CrashesPage() {
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [crashes, setCrashes] = useState<CrashDoc[]>([]);
  const [selected, setSelected] = useState<CrashDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveDeviceId = useMemo(() => deviceId.trim(), [deviceId]);

  async function load(id: string) {
    const did = id.trim();
    if (!did) {
      setError("Enter deviceId first.");
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);

    try {
      const list = await getCrashesByDevice(did);
      setCrashes(list || []);
      setSelected((list || [])[0] || null);
    } catch (e) {
      console.error("load crashes failed", e);
      setError("Failed to load crashes (check deviceId / backend / api key).");
      setCrashes([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const last = localStorage.getItem(STORAGE_KEYS.LAST_CRASH_DEVICE) || "";
      if (last) setDeviceId(last);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (effectiveDeviceId) localStorage.setItem(STORAGE_KEYS.LAST_CRASH_DEVICE, effectiveDeviceId);
    } catch {}
  }, [effectiveDeviceId]);

  return (
    <div className="container mx-auto">
      <div className="flex items-center justify-between py-4">
        <div>
          <h2 className="text-xl font-semibold">Crashes</h2>
          <p className="text-sm text-gray-500">Per-device crash logs</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-5">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
          <input
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            placeholder="Enter deviceId (uniqueid)"
            className="border rounded p-2 w-full md:w-96"
          />
          <button
            onClick={() => load(deviceId)}
            className="px-4 py-2 bg-[var(--brand)] text-white rounded-md"
            disabled={loading}
          >
            {loading ? "Loading…" : "Load Crashes"}
          </button>
          <button
            onClick={() => {
              setDeviceId("");
              setCrashes([]);
              setSelected(null);
              setError(null);
            }}
            className="px-4 py-2 border rounded-md"
          >
            Clear
          </button>
        </div>
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="bg-white rounded-lg shadow p-4 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-600">Crash List</div>
            <div className="text-xs text-gray-400">{crashes.length}</div>
          </div>

          <div className="space-y-2 max-h-[65vh] overflow-auto">
            {loading ? (
              <div className="text-sm text-gray-400">Loading…</div>
            ) : crashes.length === 0 ? (
              <div className="text-sm text-gray-400">No crashes loaded.</div>
            ) : (
              crashes.map((c) => {
                const ts = c.timestamp || (c.createdAt ? new Date(c.createdAt).getTime() : 0);
                const isSel = selected?._id === c._id;
                return (
                  <div
                    key={c._id || `${c.title}-${ts}`}
                    onClick={() => setSelected(c)}
                    className={`p-2 rounded border cursor-pointer ${
                      isSel ? "bg-[var(--brand)]/10 border-[var(--brand)]/30" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{c.title || "crash"}</div>
                    <div className="text-xs text-gray-400">{ts ? new Date(ts).toLocaleString() : "-"}</div>
                    <div className="text-xs text-gray-500 truncate">{c.deviceId || c.uniqueid || ""}</div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="bg-white rounded-lg shadow p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-gray-600">Crash Viewer</div>
              <div className="text-xs text-gray-400">{selected ? `ID: ${selected._id || "-"}` : "Select a crash"}</div>
            </div>

            {selected && (
              <button
                onClick={() => {
                  try {
                    navigator.clipboard?.writeText(JSON.stringify(selected, null, 2));
                    alert("Copied crash JSON");
                  } catch {
                    alert("Copy failed");
                  }
                }}
                className="px-3 py-1 border rounded text-sm"
              >
                Copy JSON
              </button>
            )}
          </div>

          {!selected ? (
            <div className="text-sm text-gray-400 p-4">No crash selected.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="border rounded p-3">
                  <div className="text-xs text-gray-500">Device</div>
                  <div className="text-sm font-medium">{selected.deviceId || selected.uniqueid || "-"}</div>
                </div>
                <div className="border rounded p-3">
                  <div className="text-xs text-gray-500">Title</div>
                  <div className="text-sm font-medium">{selected.title || "crash"}</div>
                </div>
                <div className="border rounded p-3">
                  <div className="text-xs text-gray-500">Time</div>
                  <div className="text-sm font-medium">
                    {selected.timestamp
                      ? new Date(selected.timestamp).toLocaleString()
                      : selected.createdAt
                      ? new Date(selected.createdAt).toLocaleString()
                      : "-"}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">Body</div>
                <pre className="bg-gray-50 p-3 rounded max-h-[55vh] overflow-auto text-xs">
                  {JSON.stringify(selected.body || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
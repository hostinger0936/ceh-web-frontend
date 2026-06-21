import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFavoritesMap, setFavorite } from "../services/api/favorites";
import wsService from "../services/ws/wsService";
import AnimatedAppBackground from "../components/layout/AnimatedAppBackground";

function SurfaceCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-[24px] border border-slate-200 bg-white/92 shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

export default function FavoritesPage() {
  const nav = useNavigate();

  const [map, setMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const m = await getFavoritesMap();
      setMap(m || {});
    } catch (e) {
      console.error("load favorites failed", e);
      setError("Failed to load favorites");
      setMap({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
    wsService.connect();

    const off = wsService.onMessage((msg) => {
      if (!msg || msg.type !== "event") return;

      if (msg.event === "favorite:update") {
        const deviceId = safeStr(msg?.data?.deviceId || msg.deviceId || "");
        if (!deviceId) return;

        const favorite = !!msg?.data?.favorite;
        setMap((prev) => ({ ...prev, [deviceId]: favorite }));
        return;
      }

      if (msg.event === "device:delete") {
        const deviceId = safeStr(msg?.data?.deviceId || msg.deviceId || "");
        if (!deviceId) return;

        setMap((prev) => {
          const copy = { ...prev };
          delete copy[deviceId];
          return copy;
        });
      }
    });

    return () => {
      off();
    };
  }, []);

  const favoriteIds = useMemo(() => {
    return Object.entries(map)
      .filter(([, fav]) => !!fav)
      .map(([deviceId]) => deviceId)
      .sort((a, b) => (a > b ? 1 : -1));
  }, [map]);

  const filteredIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return favoriteIds;
    return favoriteIds.filter((deviceId) => deviceId.toLowerCase().includes(q));
  }, [favoriteIds, search]);

  const favCount = favoriteIds.length;

  async function toggle(deviceId: string) {
    const curr = !!map[deviceId];
    const next = !curr;

    setBusyId(deviceId);
    setMap((prev) => ({ ...prev, [deviceId]: next }));

    try {
      await setFavorite(deviceId, next);
    } catch (e) {
      console.error("toggle favorite failed", e);
      setMap((prev) => ({ ...prev, [deviceId]: curr }));
      alert("Failed to update favorite");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AnimatedAppBackground>
      <div className="mx-auto w-full max-w-[420px] px-3 pb-24 pt-4">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[22px] font-extrabold tracking-tight text-slate-900">
                Favorites
              </div>
              <div className="text-[12px] text-slate-500">
                Quick access to your favorite devices
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-700">
                Total: {favCount}
              </div>

              <button
                onClick={() => void load()}
                className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.99]"
                type="button"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search device id"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />

            <div className="mt-2 text-[12px] text-slate-500">
              Showing {filteredIds.length}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 text-center text-slate-500">
                Loading…
              </div>
            ) : filteredIds.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-slate-500">
                No favorites yet. Mark devices as favorite from Devices or Device detail.
              </div>
            ) : (
              filteredIds.map((deviceId) => {
                const fav = !!map[deviceId];
                const isBusy = busyId === deviceId;

                return (
                  <div
                    key={deviceId}
                    className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_6px_20px_rgba(15,23,42,0.05)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => nav(`/devices/${encodeURIComponent(deviceId)}`)}
                          className="block max-w-full truncate text-left text-[16px] font-extrabold text-slate-900 hover:text-sky-700"
                          title={deviceId}
                        >
                          {deviceId}
                        </button>

                        <div className="mt-1 text-[12px] text-slate-500">
                          favorite:{" "}
                          <span className="font-semibold text-slate-700">
                            {fav ? "true" : "false"}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-lg text-amber-600">
                          ★
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => void toggle(deviceId)}
                        disabled={isBusy}
                        className={[
                          "h-11 rounded-2xl border px-4 text-[14px] font-extrabold transition active:scale-[0.99]",
                          fav
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                          isBusy ? "cursor-not-allowed opacity-60" : "",
                        ].join(" ")}
                        type="button"
                      >
                        {isBusy ? "Saving…" : fav ? "★ Unfavorite" : "☆ Favorite"}
                      </button>

                      <button
                        onClick={() => nav(`/devices/${encodeURIComponent(deviceId)}`)}
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-[14px] font-extrabold text-slate-900 hover:bg-slate-50 active:scale-[0.99]"
                        type="button"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
        </SurfaceCard>
      </div>
    </AnimatedAppBackground>
  );
}

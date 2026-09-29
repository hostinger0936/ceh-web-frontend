// build:2026-09-29
import { AxiosError } from "axios";
import apiClient from "./apiClient";

function is404(err: unknown): boolean {
  const e = err as AxiosError;
  return !!(e?.response && e.response.status === 404);
}

export async function getFavoritesMap(): Promise<Record<string, boolean>> {
  try {
    const res = await apiClient.get("/api/favorites");
    if (res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
      return res.data as Record<string, boolean>;
    }
    return {};
  } catch (e) {
    if (is404(e)) return {};
    throw e;
  }
}

export async function setFavorite(deviceId: string, fav: boolean): Promise<void> {
  const id = encodeURIComponent(deviceId);
  try {
    await apiClient.put(`/api/favorites/${id}`, { favorite: !!fav });
  } catch (e) {
    if (is404(e)) {
      throw new Error("Favorites API missing. Backend: mount /api/favorites router.");
    }
    throw e;
  }
}

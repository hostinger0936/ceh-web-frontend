import axios, { AxiosError } from "axios";
import { ENV, apiHeaders } from "../../config/constants";

function assertApiBase() {
  if (!ENV.API_BASE) {
    throw new Error("ENV.API_BASE missing. Check VITE_API_BASE in .env and restart dev server.");
  }
}

function is404(err: unknown): boolean {
  const e = err as AxiosError;
  return !!(e?.response && e.response.status === 404);
}

export async function getFavoritesMap(): Promise<Record<string, boolean>> {
  assertApiBase();
  try {
    const res = await axios.get(`${ENV.API_BASE}/api/favorites`, {
      headers: apiHeaders(),
      timeout: 10_000,
    });

    if (res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
      return res.data as Record<string, boolean>;
    }
    return {};
  } catch (e) {
    // If backend not mounted yet, don't break devices page
    if (is404(e)) return {};
    throw e;
  }
}

export async function setFavorite(deviceId: string, fav: boolean): Promise<void> {
  assertApiBase();
  const id = encodeURIComponent(deviceId);

  try {
    await axios.put(
      `${ENV.API_BASE}/api/favorites/${id}`,
      { favorite: !!fav },
      { headers: apiHeaders(), timeout: 10_000 },
    );
  } catch (e) {
    if (is404(e)) {
      throw new Error("Favorites API missing. Backend: mount /api/favorites router.");
    }
    throw e;
  }
}

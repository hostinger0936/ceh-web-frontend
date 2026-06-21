import { useEffect, useState } from "react";
import { isLoggedIn, getLoggedInUser } from "../services/api/auth";
import { useStore } from "../store/useStore";

/**
 * useAuth.ts — FULL & FINAL
 *
 * Small hook:
 * - reads auth from localStorage (via services/api/auth.ts)
 * - syncs zustand store (optional)
 *
 * Useful if you want auth-driven UI later.
 */

export function useAuth() {
  const store = useStore();
  const [loggedIn, setLoggedIn] = useState<boolean>(isLoggedIn());
  const [username, setUsername] = useState<string>(getLoggedInUser());

  useEffect(() => {
    const sync = () => {
      const li = isLoggedIn();
      const un = getLoggedInUser();
      setLoggedIn(li);
      setUsername(un);
      store.refreshAuthFromStorage();
    };

    // sync on mount
    sync();

    // sync when storage changes (multi-tab)
    const onStorage = () => sync();
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loggedIn, username };
}
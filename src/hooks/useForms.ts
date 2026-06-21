import { useEffect, useState } from "react";
import type { FormSubmissionDoc } from "../types";
import { listFormSubmissions } from "../services/api/forms";

/**
 * useForms.ts — FULL & FINAL
 *
 * Convenience hook for form submissions list.
 */

export function useForms(autoRefreshMs: number | null = 20000) {
  const [forms, setForms] = useState<FormSubmissionDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listFormSubmissions();
      setForms(list || []);
    } catch (e) {
      console.error("useForms refresh failed", e);
      setError("Failed to load forms");
      setForms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();

    if (!autoRefreshMs || autoRefreshMs <= 0) return;
    const id = setInterval(() => refresh().catch(() => {}), autoRefreshMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshMs]);

  return { forms, loading, error, refresh };
}
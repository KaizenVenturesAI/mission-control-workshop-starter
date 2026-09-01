"use client";

import { useCallback, useEffect, useState } from "react";
import type { CRMConsolePayload } from "@/lib/crm/consoleTypes";

const CONSOLE_CACHE_TTL_MS = 30_000;
let cachedPayload: CRMConsolePayload | null = null;
let cachedAt = 0;
let inflightRequest: Promise<CRMConsolePayload | null> | null = null;

async function fetchConsolePayload(): Promise<CRMConsolePayload> {
  const response = await fetch("/api/crm/console", { cache: "no-store" });
  if (!response.ok) throw new Error(`CRM console returned ${response.status}`);
  return (await response.json()) as CRMConsolePayload;
}

export function useCRMConsoleData() {
  const [data, setData] = useState<CRMConsolePayload | null>(cachedPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    if (!force && cachedPayload && Date.now() - cachedAt < CONSOLE_CACHE_TTL_MS) {
      setData(cachedPayload);
      setError(null);
      setLoading(false);
      return cachedPayload;
    }

    setLoading(true);
    try {
      inflightRequest = force || !inflightRequest ? fetchConsolePayload().catch((err) => {
        throw err;
      }) : inflightRequest;
      const next = await inflightRequest;
      if (!next) return null;
      cachedPayload = next;
      cachedAt = Date.now();
      setData(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CRM console data");
      return null;
    } finally {
      inflightRequest = null;
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => load(true), [load]);

  useEffect(() => {
    void load(false);
  }, [load]);

  return { data, loading, error, refresh };
}

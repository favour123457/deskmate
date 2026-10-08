"use client";
// One fetch of live news & ratings for the held stocks, shared by the Desk slideshow and the News page.
import { useCallback, useEffect, useState } from "react";
import type { StockBrief } from "./research";

const REFRESH_MS = 5 * 60_000;

export type Research = {
  briefs: StockBrief[] | null;
  at: number | null;
  error: string | null;
  loading: boolean;
  now: number;
  reload: () => void;
  empty: boolean;
};

export function ago(ts: number, now: number) {
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export function useResearch(symbols: string[]): Research {
  const key = symbols.join(",");
  const [briefs, setBriefs] = useState<StockBrief[] | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: key.split(",") }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setBriefs(j.briefs);
      setAt(j.at);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  return { briefs, at, error, loading, now, reload, empty: !key };
}

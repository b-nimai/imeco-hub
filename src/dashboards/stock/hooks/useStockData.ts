import { useCallback, useEffect, useState } from 'react';

import snapshotRaw from '@/dashboards/stock/data/stockSnapshot.json';
import type { StockRawPayload } from '@/dashboards/stock/data/types';

const STORAGE_KEY = 'hub:stock:v1';
const TTL_MS = 30 * 60 * 1000; // 30 minutes

const APPS_SCRIPT_URL = (
  import.meta.env.VITE_STOCK_APPS_SCRIPT_URL as string | undefined
)?.trim();

interface CachedStockPayload {
  fetchedAt: number;
  payload: StockRawPayload;
}

function readLocalCache(): CachedStockPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedStockPayload;
    if (!parsed?.payload?.catalog || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalCache(payload: StockRawPayload): number {
  const fetchedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fetchedAt, payload }));
  } catch {
    // Ignore storage quota errors
  }
  return fetchedAt;
}

const SNAPSHOT_PAYLOAD = snapshotRaw as unknown as StockRawPayload;

export interface UseStockDataResult {
  payload: StockRawPayload;
  fetchedAt: number | null;
  syncing: boolean;
  error: string | null;
  isLiveConfigured: boolean;
  refresh: () => void;
}

export function useStockData(): UseStockDataResult {
  const isLiveConfigured = Boolean(APPS_SCRIPT_URL);
  const [cached] = useState(readLocalCache);

  const [payload, setPayload] = useState<StockRawPayload>(
    cached?.payload ?? SNAPSHOT_PAYLOAD,
  );
  const [fetchedAt, setFetchedAt] = useState<number | null>(
    cached?.fetchedAt ?? Date.parse(SNAPSHOT_PAYLOAD.generatedAt),
  );
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLive = useCallback(async () => {
    if (!APPS_SCRIPT_URL) return;
    setSyncing(true);
    try {
      const res = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`Proxy HTTP ${res.status}`);
      }
      const json = (await res.json()) as StockRawPayload;
      if (!json?.catalog || !Array.isArray(json.catalog)) {
        throw new Error('Invalid payload shape from Apps Script proxy');
      }
      const ts = writeLocalCache(json);
      setPayload(json);
      setFetchedAt(ts);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSyncing(false);
    }
  }, []);

  const refresh = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    if (APPS_SCRIPT_URL) {
      void fetchLive();
    } else {
      setFetchedAt(Date.parse(SNAPSHOT_PAYLOAD.generatedAt));
    }
  }, [fetchLive]);

  useEffect(() => {
    if (!APPS_SCRIPT_URL) return;
    const isFresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
    const boot = isFresh ? undefined : setTimeout(() => void fetchLive(), 0);
    const interval = setInterval(() => void fetchLive(), TTL_MS);
    return () => {
      if (boot) clearTimeout(boot);
      clearInterval(interval);
    };
  }, [cached, fetchLive]);

  return {
    payload,
    fetchedAt,
    syncing,
    error,
    isLiveConfigured,
    refresh,
  };
}

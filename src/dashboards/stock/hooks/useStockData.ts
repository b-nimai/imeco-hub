import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { StockRawPayload } from '@/dashboards/stock/data/types';

// One shared store for the whole app (Home + Warehouse Stock), so every screen shows the same
// fetch and never mixes old and new numbers.
//
// Loading rules:
//   - First load / manual refresh: no data is shown until fresh sheet data arrives (loader).
//   - Background refresh (every 5 min): current numbers stay on screen and are swapped in one go
//     once the new fetch completes — nothing half-updated is ever shown.
//   - Fetch failure: the last fetched data is shown (clearly labelled) ONLY if it is at most
//     MAX_FALLBACK_AGE_MS old. Anything older is never shown — the error state appears instead.

const STORAGE_KEY = 'hub:stock:v1';
export const STOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — keep the dashboard close to the sheet
/** Oldest data allowed on screen when a sync fails. Older data is hidden, not shown. */
export const MAX_FALLBACK_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbywnYoFJPEcsgOzfMSD048-CDT79PJ5cVQnPtugKOEFKkcOYnKGjMA_qk8HRaAZQK-WQw/exec';

const APPS_SCRIPT_URL =
  (import.meta.env.VITE_STOCK_APPS_SCRIPT_URL as string | undefined)?.trim() ||
  DEFAULT_APPS_SCRIPT_URL;

/** `live` = fetched in this session · `last-saved` = last fetched data restored after a failed sync. */
export type StockDataSource = 'live' | 'last-saved';

interface StockState {
  payload: StockRawPayload | null;
  source: StockDataSource | null;
  fetchedAt: number | null;
  /** True during any fetch (first load, manual refresh or background refresh). */
  syncing: boolean;
  error: string | null;
}

interface SavedStock {
  fetchedAt: number;
  payload: StockRawPayload;
}

function readLastSaved(): SavedStock | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedStock;
    if (!parsed?.payload?.catalog || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLastSaved(saved: SavedStock): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Ignore storage quota / privacy-mode errors
  }
}

let state: StockState = {
  payload: null,
  source: null,
  fetchedAt: null,
  syncing: false,
  error: null,
};
const listeners = new Set<() => void>();
let requestSeq = 0;

function setState(patch: Partial<StockState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Exported for tests: current store state. */
export function getSnapshot() {
  return state;
}

/** Exported for tests: run one sync now. */
export async function fetchLive(): Promise<void> {
  const seq = ++requestSeq;
  setState({ syncing: true, error: null });
  try {
    const res = await fetch(APPS_SCRIPT_URL, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    const json = (await res.json()) as StockRawPayload;
    if (!json?.catalog || !Array.isArray(json.catalog)) {
      throw new Error('Invalid payload shape from Apps Script proxy');
    }
    if (seq !== requestSeq) return; // a newer request superseded this one
    const fetchedAt = Date.now();
    writeLastSaved({ fetchedAt, payload: json });
    setState({ payload: json, source: 'live', fetchedAt, syncing: false, error: null });
  } catch (e) {
    if (seq !== requestSeq) return;
    const error = e instanceof Error ? e.message : String(e);
    // Fall back to the last fetched data — what's on screen, else the last saved sync — but only
    // if it is recent enough. Too-old data is cleared so it can't be mistaken for current stock.
    const fallback: SavedStock | null =
      state.payload && state.fetchedAt !== null
        ? { payload: state.payload, fetchedAt: state.fetchedAt }
        : readLastSaved();
    if (fallback && Date.now() - fallback.fetchedAt <= MAX_FALLBACK_AGE_MS) {
      setState({
        payload: fallback.payload,
        fetchedAt: fallback.fetchedAt,
        source: state.payload && state.source === 'live' ? 'live' : 'last-saved',
        syncing: false,
        error,
      });
    } else {
      setState({ payload: null, source: null, fetchedAt: null, syncing: false, error });
    }
  }
}

function isStale(): boolean {
  return (
    state.source !== 'live' ||
    state.fetchedAt === null ||
    Date.now() - state.fetchedAt >= STOCK_TTL_MS
  );
}

/** Manual refresh: clear what's on screen and show the loader until fresh data arrives. */
function refreshStock() {
  setState({ payload: null, source: null, fetchedAt: null });
  void fetchLive();
}

export interface UseStockDataResult {
  /** null while loading, or after a failed fetch with no recent (≤2h) data — render loader/error. */
  payload: StockRawPayload | null;
  source: StockDataSource | null;
  fetchedAt: number | null;
  syncing: boolean;
  /** No data on screen and a fetch is running → show the loader. */
  loading: boolean;
  error: string | null;
  isLiveConfigured: boolean;
  refresh: () => void;
}

export function useStockData(): UseStockDataResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (!state.syncing && isStale()) void fetchLive();
    const interval = setInterval(() => {
      if (!state.syncing) void fetchLive();
    }, STOCK_TTL_MS);
    return () => clearInterval(interval);
  }, []);

  const refresh = useCallback(() => refreshStock(), []);

  return {
    payload: snap.payload,
    source: snap.source,
    fetchedAt: snap.fetchedAt,
    syncing: snap.syncing,
    loading: snap.payload === null && snap.syncing,
    error: snap.error,
    isLiveConfigured: Boolean(APPS_SCRIPT_URL),
    refresh,
  };
}

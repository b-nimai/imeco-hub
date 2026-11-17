import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { StockRawPayload } from '@/dashboards/stock/data/types';

// One shared store for the whole app (Home + Warehouse Stock), so every screen shows the same
// fetch and never mixes old and new numbers.
//
// Where data comes from (fastest first):
//   1. Supabase `stock_snapshots` — built in the background by the Apps Script (~0.3 s to read).
//   2. Apps Script web app — serves its cached build, or builds live on a cache miss (slow).
// Supabase is used while its background checks are recent (PIPELINE_STALE_MS); if the background
// job has stalled, the Apps Script is asked directly.
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

// Public by design: RLS lets this key read stock_snapshots and nothing else (scripts/stock-supabase.sql).
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?.trim()
  .replace(/\/+$/, '');
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** Background checks run every 5 min; a snapshot not checked for this long means the job stalled. */
export const PIPELINE_STALE_MS = 30 * 60 * 1000;

/** `live` = fetched in this session · `last-saved` = last fetched data restored after a failed sync. */
export type StockDataSource = 'live' | 'last-saved';

/** Which backend served the data on screen. */
export type StockDataVia = 'supabase' | 'apps-script';

interface StockState {
  payload: StockRawPayload | null;
  source: StockDataSource | null;
  via: StockDataVia | null;
  /**
   * How current the data is: when the sheets were last checked (Supabase `checked_at`), or the
   * fetch time for a direct Apps Script read. Drives "Synced Xm ago" and the 2-hour fallback rule.
   */
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
  via: null,
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

interface Fetched {
  payload: StockRawPayload;
  dataAsOf: number;
  via: StockDataVia;
  /** Supabase `built_at` of this payload (null for Apps Script reads). */
  builtAt: string | null;
}

/** `built_at` of the Supabase build currently on screen — lets polls skip unchanged downloads. */
let onScreenBuiltAt: string | null = null;

function assertPayload(json: unknown, label: string): StockRawPayload {
  const p = json as StockRawPayload | null;
  if (!p?.catalog || !Array.isArray(p.catalog)) throw new Error(`Invalid payload from ${label}`);
  return p;
}

interface SnapshotRow {
  payload?: unknown;
  built_at: string;
  checked_at: string;
}

async function supabaseSelect(columns: string): Promise<SnapshotRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/stock_snapshots?id=eq.latest&select=${columns}`,
    {
      headers: { apikey: SUPABASE_KEY as string, Authorization: `Bearer ${SUPABASE_KEY}` },
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  const rows = (await res.json()) as SnapshotRow[];
  return rows[0] ?? null;
}

/**
 * Latest background build from Supabase, or null if Supabase isn't configured / has no row.
 *
 * Egress-friendly: when a Supabase build is already on screen, poll only the tiny
 * `built_at, checked_at` columns first and download the ~230 KB payload only if it changed.
 */
async function fromSupabase(): Promise<Fetched | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const asOf = (row: SnapshotRow) =>
    Date.parse(row.checked_at) || Date.parse(row.built_at) || Date.now();

  if (state.payload && state.via === 'supabase' && onScreenBuiltAt) {
    const head = await supabaseSelect('built_at,checked_at');
    if (!head) return null;
    if (head.built_at === onScreenBuiltAt) {
      return {
        payload: state.payload,
        dataAsOf: asOf(head),
        via: 'supabase',
        builtAt: head.built_at,
      };
    }
  }

  const row = await supabaseSelect('payload,built_at,checked_at');
  if (!row) return null;
  return {
    payload: assertPayload(row.payload, 'Supabase'),
    dataAsOf: asOf(row),
    via: 'supabase',
    builtAt: row.built_at,
  };
}

async function fromAppsScript(): Promise<Fetched> {
  const res = await fetch(APPS_SCRIPT_URL, { redirect: 'follow', cache: 'no-store' });
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  const payload = assertPayload(await res.json(), 'Apps Script proxy');
  return { payload, dataAsOf: Date.now(), via: 'apps-script', builtAt: null };
}

/** Supabase first; Apps Script if Supabase is missing, failing or its background job stalled. */
async function fetchLatest(): Promise<Fetched> {
  let stale: Fetched | null = null;
  try {
    const sb = await fromSupabase();
    if (sb && Date.now() - sb.dataAsOf <= PIPELINE_STALE_MS) return sb;
    stale = sb;
  } catch {
    // fall through to the Apps Script
  }
  try {
    return await fromAppsScript();
  } catch (err) {
    // Both failed: a stalled-but-recent Supabase build is still better than nothing.
    if (stale && Date.now() - stale.dataAsOf <= MAX_FALLBACK_AGE_MS) return stale;
    throw err;
  }
}

/** Exported for tests: run one sync now. */
export async function fetchLive(): Promise<void> {
  const seq = ++requestSeq;
  setState({ syncing: true, error: null });
  try {
    const { payload, dataAsOf, via, builtAt } = await fetchLatest();
    if (seq !== requestSeq) return; // a newer request superseded this one
    onScreenBuiltAt = builtAt;
    writeLastSaved({ fetchedAt: dataAsOf, payload });
    setState({ payload, source: 'live', via, fetchedAt: dataAsOf, syncing: false, error: null });
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
      setState({ payload: null, source: null, via: null, fetchedAt: null, syncing: false, error });
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
  onScreenBuiltAt = null; // manual refresh always downloads the full build
  setState({ payload: null, source: null, via: null, fetchedAt: null });
  void fetchLive();
}

export interface UseStockDataResult {
  /** null while loading, or after a failed fetch with no recent (≤2h) data — render loader/error. */
  payload: StockRawPayload | null;
  source: StockDataSource | null;
  via: StockDataVia | null;
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
    via: snap.via,
    fetchedAt: snap.fetchedAt,
    syncing: snap.syncing,
    loading: snap.payload === null && snap.syncing,
    error: snap.error,
    isLiveConfigured: Boolean(APPS_SCRIPT_URL),
    refresh,
  };
}

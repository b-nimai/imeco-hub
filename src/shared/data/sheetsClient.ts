// Google Sheets fetch layer shared by every Sheets-backed dashboard.
//
// Merged from the billing and dispatch dashboards' clients (both originally ported from
// mission-control-dashboard). Three mechanisms, cheapest first:
//   1. localStorage — a page reload inside the TTL can render from disk with ZERO network
//      (opt-in per dashboard via readCachedPayload / writeCachedPayload).
//   2. In-memory promise cache keyed by URL — de-dupes concurrent/duplicate callers.
//   3. Retry with exponential backoff + jitter on 429/5xx.
//
// The API key is public by design (inlined into the bundle); it is protected by its
// Google Cloud restrictions — Sheets API only, plus an HTTP-referrer allow-list.

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const MAX_RETRIES = 4;
const DEFAULT_TTL_MS = 60 * 60 * 1000;

export type Rows = string[][];
export type RangeMap = Record<string, Rows>;
export type ValueRenderOption = 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA';

export interface CachedPayload {
  fetchedAt: number;
  ranges: RangeMap;
}

/** Which env var holds the spreadsheet id — only used to make the error message actionable. */
interface Target {
  spreadsheetId: string | undefined;
  envName: string;
  /** How long an identical request is served from memory. */
  ttlMs?: number;
  /** Overrides VITE_GOOGLE_API_KEY for a dashboard whose sheets live under another key. */
  apiKey?: string;
}

const cache = new Map<string, { t: number; p: Promise<unknown> }>();

async function sheetsFetch<T>(url: string, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response | undefined;
    try {
      res = await fetch(url);
    } catch (e) {
      lastErr = e;
    }
    if (res) {
      if (res.ok) return (await res.json()) as T;
      // 4xx other than 429 are permanent (bad range, bad key) — don't retry.
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`${label} ${res.status}`);
      }
      lastErr = new Error(`${label} ${res.status}`);
    }
    if (attempt < MAX_RETRIES) {
      const backoff = Math.min(8000, 600 * 2 ** attempt) + Math.random() * 400;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`);
}

function cachedGet<T>(url: string, label: string, ttlMs: number): Promise<T> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.t < ttlMs) return hit.p as Promise<T>;
  // Cache the promise immediately so concurrent callers share one request.
  const p = sheetsFetch<T>(url, label).catch((err) => {
    cache.delete(url); // don't cache failures — let the next call retry
    throw err;
  });
  cache.set(url, { t: now, p });
  return p;
}

/** Validates the target and returns its spreadsheet id plus the API key to use. */
function assertConfigured({ spreadsheetId, envName, apiKey }: Target): [string, string] {
  const key = apiKey || API_KEY;
  if (!key) throw new Error('VITE_GOOGLE_API_KEY not configured');
  if (!spreadsheetId) throw new Error(`${envName} not configured`);
  return [spreadsheetId, key];
}

/** Every tab title in the workbook. `fields=` keeps the response to a few hundred bytes. */
export async function getSheetTitles(target: Target): Promise<string[]> {
  const [id, key] = assertConfigured(target);
  const url = `${BASE}/${id}?fields=sheets.properties.title&key=${key}`;
  const data = await cachedGet<{ sheets?: { properties?: { title?: string } }[] }>(
    url,
    'Sheets metadata',
    target.ttlMs ?? DEFAULT_TTL_MS,
  );
  return (data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean);
}

/**
 * Fetch many ranges in a single HTTP request.
 *
 * Returns a map keyed by the *requested* range strings, in request order. We deliberately
 * do not key off `valueRanges[i].range` from the response — the API rewrites it (adds
 * quotes, expands `2:200` to `A2:VP200`), so echoing our own keys back is more stable.
 */
export async function batchGetValues(target: Target, ranges: string[]): Promise<RangeMap> {
  const [id, key] = assertConfigured(target);
  const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `${BASE}/${id}/values:batchGet?${qs}&majorDimension=ROWS&key=${key}`;
  const data = await cachedGet<{ valueRanges?: { values?: Rows }[] }>(
    url,
    'Sheets batchGet',
    target.ttlMs ?? DEFAULT_TTL_MS,
  );
  const out: RangeMap = {};
  ranges.forEach((range, i) => {
    out[range] = data.valueRanges?.[i]?.values ?? [];
  });
  return out;
}

/**
 * One range of one tab. `valueRenderOption` is exposed because some sheets need two views of
 * the same grid: UNFORMATTED_VALUE for numbers and FORMULA for `=IMAGE("url")` cells, whose URL
 * is only reachable as formula text.
 */
export async function fetchSheetValues(
  target: Target,
  sheetName: string,
  range = 'A1:Z1000',
  valueRenderOption: ValueRenderOption = 'UNFORMATTED_VALUE',
): Promise<unknown[][]> {
  const [id, key] = assertConfigured(target);
  const encoded = encodeURIComponent(`'${sheetName}'!${range}`);
  const url = `${BASE}/${id}/values/${encoded}?valueRenderOption=${valueRenderOption}&key=${key}`;
  const data = await cachedGet<{ values?: unknown[][] }>(
    url,
    `Range fetch for "${sheetName}"`,
    target.ttlMs ?? DEFAULT_TTL_MS,
  );
  return data.values ?? [];
}

// ── localStorage ────────────────────────────────────────────────────────────────
// Keys MUST be namespaced per dashboard (`hub:<id>:...`) — every dashboard shares one origin.

export function readCachedPayload(key: string): CachedPayload | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!parsed?.ranges || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null; // corrupt or quota-blocked storage is not an error worth surfacing
  }
}

export function writeCachedPayload(key: string, ranges: RangeMap): CachedPayload {
  const payload: CachedPayload = { fetchedAt: Date.now(), ranges };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Over quota — the in-memory cache still covers this session.
  }
  return payload;
}

/**
 * Drop the in-memory cache (and, if given, a localStorage payload) so the next fetch goes to
 * the network. Wired to each dashboard's manual refresh.
 */
export function clearSheetsCache(storageKey?: string): void {
  cache.clear();
  if (!storageKey) return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

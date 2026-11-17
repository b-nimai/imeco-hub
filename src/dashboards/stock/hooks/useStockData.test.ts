import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HOUR = 60 * 60 * 1000;
const payload = (tag: string) => ({ generatedAt: tag, catalog: [] }) as never;

type Route = { supabase?: () => unknown; appsScript?: () => unknown };

/** Route fetch by URL: Supabase REST vs the Apps Script web app. A thrown error = network down. */
function mockFetch(route: Route) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const isSupabase = url.includes('/rest/v1/stock_snapshots');
      calls.push(isSupabase ? 'supabase' : 'apps-script');
      const handler = isSupabase ? route.supabase : route.appsScript;
      if (!handler) throw new Error('network down');
      const body = handler();
      return { ok: true, status: 200, json: async () => body };
    }),
  );
  return calls;
}

const sbRow = (tag: string, checkedAgoMs: number) => [
  {
    payload: payload(tag),
    built_at: new Date(Date.now() - checkedAgoMs).toISOString(),
    checked_at: new Date(Date.now() - checkedAgoMs).toISOString(),
  },
];

async function loadStore() {
  vi.resetModules(); // fresh module-level store per test
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  return import('./useStockData');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('stock data store — sources', () => {
  it('reads the background build from Supabase when it was checked recently', async () => {
    const store = await loadStore();
    const calls = mockFetch({
      supabase: () => sbRow('SB', 3 * 60_000),
      appsScript: () => payload('AS'),
    });
    await store.fetchLive();
    expect(calls).toEqual(['supabase']);
    expect(store.getSnapshot()).toMatchObject({ source: 'live', via: 'supabase', error: null });
    expect(store.getSnapshot().payload).toEqual(payload('SB'));
    // "Synced Xm ago" reflects when the sheets were last checked, not when the browser fetched.
    expect(store.getSnapshot().fetchedAt).toBe(Date.now() - 3 * 60_000);
  });

  it('asks the Apps Script directly when the background job has stalled', async () => {
    const store = await loadStore();
    const calls = mockFetch({
      supabase: () => sbRow('SB', 45 * 60_000),
      appsScript: () => payload('AS'),
    });
    await store.fetchLive();
    expect(calls).toEqual(['supabase', 'apps-script']);
    expect(store.getSnapshot()).toMatchObject({ via: 'apps-script' });
    expect(store.getSnapshot().payload).toEqual(payload('AS'));
  });

  it('falls back to the Apps Script when Supabase is down or empty', async () => {
    const store = await loadStore();
    mockFetch({ appsScript: () => payload('AS') });
    await store.fetchLive();
    expect(store.getSnapshot().payload).toEqual(payload('AS'));

    mockFetch({ supabase: () => [], appsScript: () => payload('AS2') });
    await store.fetchLive();
    expect(store.getSnapshot().payload).toEqual(payload('AS2'));
  });

  it('uses a stalled Supabase build (< 2h) when the Apps Script is also down', async () => {
    const store = await loadStore();
    mockFetch({ supabase: () => sbRow('SB', 50 * 60_000) });
    await store.fetchLive();
    expect(store.getSnapshot()).toMatchObject({ via: 'supabase', error: null });
    expect(store.getSnapshot().payload).toEqual(payload('SB'));
  });
});

describe('stock data store — egress', () => {
  it('polls only built_at when the on-screen build is unchanged, downloads when it changes', async () => {
    const store = await loadStore();
    const urls: string[] = [];
    let builtAt = '2026-11-17T09:55:00.000Z';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        const full = url.includes('select=payload');
        const row = { built_at: builtAt, checked_at: new Date().toISOString() };
        return {
          ok: true,
          status: 200,
          json: async () => [full ? { ...row, payload: payload(builtAt) } : row],
        };
      }),
    );

    await store.fetchLive(); // first load: full download
    await store.fetchLive(); // unchanged: header only
    builtAt = '2026-11-17T10:05:00.000Z';
    await store.fetchLive(); // changed: header, then full download

    const kinds = urls.map((u) => (u.includes('select=payload') ? 'full' : 'head'));
    expect(kinds).toEqual(['full', 'head', 'head', 'full']);
    expect(store.getSnapshot().payload).toEqual(payload('2026-11-17T10:05:00.000Z'));
  });
});

describe('stock data store — failed sync fallback', () => {
  it('keeps the last fetched data when a sync fails and it is under 2 hours old', async () => {
    const store = await loadStore();
    mockFetch({ supabase: () => sbRow('A', 0) });
    await store.fetchLive();

    vi.setSystemTime(new Date('2026-11-17T11:30:00Z')); // 1.5h later
    mockFetch({});
    await store.fetchLive();

    expect(store.getSnapshot().payload).toEqual(payload('A'));
    expect(store.getSnapshot().error).toBe('network down');
  });

  it('hides data older than 2 hours when a sync fails', async () => {
    const store = await loadStore();
    mockFetch({ supabase: () => sbRow('A', 0) });
    await store.fetchLive();

    vi.setSystemTime(Date.now() + 2 * HOUR + 60_000); // just over 2h later
    mockFetch({});
    await store.fetchLive();

    expect(store.getSnapshot().payload).toBeNull();
    expect(store.getSnapshot().error).toBe('network down');
  });
});

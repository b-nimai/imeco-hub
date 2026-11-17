import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HOUR = 60 * 60 * 1000;
const payload = (tag: string) => ({ generatedAt: tag, catalog: [] }) as never;

function mockFetchOk(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}
function mockFetchFail() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network down');
    }),
  );
}

describe('stock data store — failed sync fallback', () => {
  beforeEach(() => {
    vi.resetModules(); // fresh module-level store per test
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows fresh data after a successful sync', async () => {
    const store = await import('./useStockData');
    mockFetchOk(payload('A'));
    await store.fetchLive();
    expect(store.getSnapshot()).toMatchObject({ source: 'live', error: null });
    expect(store.getSnapshot().payload).toEqual(payload('A'));
  });

  it('keeps the last fetched data when a sync fails and it is under 2 hours old', async () => {
    const store = await import('./useStockData');
    mockFetchOk(payload('A'));
    await store.fetchLive();

    vi.setSystemTime(new Date('2026-11-17T11:30:00Z')); // 1.5h later
    mockFetchFail();
    await store.fetchLive();

    expect(store.getSnapshot().payload).toEqual(payload('A'));
    expect(store.getSnapshot().error).toBe('network down');
  });

  it('hides data older than 2 hours when a sync fails', async () => {
    const store = await import('./useStockData');
    mockFetchOk(payload('A'));
    await store.fetchLive();

    vi.setSystemTime(Date.now() + 2 * HOUR + 60_000); // just over 2h later
    mockFetchFail();
    await store.fetchLive();

    expect(store.getSnapshot().payload).toBeNull();
    expect(store.getSnapshot().error).toBe('network down');
  });
});

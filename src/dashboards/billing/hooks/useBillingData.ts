import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchBillingData, type BillingData } from '@/dashboards/billing/data/billingApi';
import { clearSheetsCache } from '@/shared/data/sheetsClient';

// Billing rows are edited a handful of times a day, so poll hourly. For an immediate update
// after a sheet edit, use the manual refresh (Imeco logo), which clears the request cache.
const REFRESH_MS = 60 * 60 * 1000;
const MAX_FAILURES = 12; // ~12 hours of consecutive failures -> reload the page

export function useBillingData() {
  const [data, setData] = useState<BillingData | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const failureCount = useRef(0);
  const lastGood = useRef<BillingData | null>(null);

  const load = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await fetchBillingData();
      lastGood.current = result;
      setData(result);
      setError(null);
      failureCount.current = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[BillingData]', message);
      setError(message);
      failureCount.current += 1;
      if (failureCount.current >= MAX_FAILURES) window.location.reload();
      // Fall back to the last known good payload so the dashboard stays on screen.
      if (lastGood.current) setData(lastGood.current);
    } finally {
      setSyncing(false);
    }
  }, []);

  const refresh = useCallback(() => {
    clearSheetsCache();
    void load();
  }, [load]);

  useEffect(() => {
    // Deferred a tick so the loading paint lands before the fetch's setState cascade.
    const boot = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearTimeout(boot);
      clearInterval(id);
    };
  }, [load]);

  return { data, syncing, error, refresh };
}

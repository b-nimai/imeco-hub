import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchFYPerformance } from './growthApi.js';

// Same hourly cadence as useGrowthData — a new completed month tab is picked up automatically.
// For an instant update after a sheet edit, use the manual refresh (Imeco logo).
const REFRESH_MS = 60 * 60 * 1000;

export function useFYData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const lastGood = useRef(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchFYPerformance();
      lastGood.current = result;
      setData(result);
      setError(null);
    } catch (err) {
      console.error('[FYData]', err.message);
      setError(err.message);
      if (lastGood.current) setData(lastGood.current);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred a tick so the loading paint lands before the fetch's setState cascade.
    const boot = setTimeout(load, 0);
    const id = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(boot);
      clearInterval(id);
    };
  }, [load]);

  return { data, loading, error, refresh: load };
}

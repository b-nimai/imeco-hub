import '@/dashboards/billing/billing.css';

import { BillingGrid } from '@/dashboards/billing/components/BillingGrid';
import { Header } from '@/dashboards/billing/components/Header';
import { useBillingData } from '@/dashboards/billing/hooks/useBillingData';

/** Navy wall-display page. Pinned to its own palette in both hub themes — it was designed dark. */
export default function BillingPage() {
  const { data, syncing, error, refresh } = useBillingData();

  if (!data) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#060c18]">
        <div className="px-6 text-center">
          {error ? (
            <>
              <div className="mb-2 text-sm font-bold text-red-400">Could not load billing data</div>
              <div className="mb-4 max-w-sm text-xs text-[#64748b]">{error}</div>
              <button
                type="button"
                onClick={refresh}
                className="rounded-lg border border-[#22c55e]/40 bg-[#22c55e]/10 px-4 py-2 text-[11px] font-bold tracking-widest text-[#22c55e] uppercase transition-colors hover:bg-[#22c55e]/20"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#22c55e] border-t-transparent" />
              <div className="text-sm font-medium tracking-widest text-[#94a3b8] uppercase">
                Loading billing data…
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const { products, channels, brands, productCount, channelCount, sheetName, updatedAt } = data;

  return (
    <div className="billing-grid relative flex min-h-full flex-col gap-2 bg-[#060c18] p-2 lg:h-full lg:overflow-hidden">
      {error && (
        <div className="absolute top-2 right-2 z-50 rounded-md border border-red-800/50 bg-red-900/80 px-2 py-1 text-[9px] text-red-300">
          ⚠ Using cached data
        </div>
      )}
      {syncing && !error && (
        <div className="absolute top-2 right-2 z-50 rounded-md bg-[#1a2d45]/80 px-2 py-1 text-[9px] text-[#64748b]">
          ↻ Syncing…
        </div>
      )}

      <div style={{ animation: 'fadeInUp 0.4s ease-out 0ms both' }}>
        <Header
          subtitle={`${sheetName} — ${productCount} products × ${channelCount} channels`}
          onRefresh={refresh}
          syncing={syncing}
          updatedAt={updatedAt}
        />
      </div>

      <div
        className="min-h-[320px] flex-1 lg:min-h-0"
        style={{ animation: 'fadeInUp 0.4s ease-out 80ms both' }}
      >
        <BillingGrid products={products} channels={channels} brands={brands} />
      </div>
    </div>
  );
}

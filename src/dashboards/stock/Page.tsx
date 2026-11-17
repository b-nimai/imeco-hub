import { AlertTriangle, CircleCheck, Info, RefreshCw } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { ProductStockModal } from '@/dashboards/stock/components/ProductStockModal';
import { StockLoader } from '@/dashboards/stock/components/StockLoader';
import { fmtSyncTime, fmtUnits } from '@/dashboards/stock/data/format';
import {
  buildStockDashboardSummary,
  EMPTY_STOCK_PAYLOAD,
} from '@/dashboards/stock/data/parseStock';
import type {
  ProductStatus,
  VelocityWindow,
  WarehouseScope,
} from '@/dashboards/stock/data/types';
import { useStockData } from '@/dashboards/stock/hooks/useStockData';
import { STOCK_PAGES, type StockTab } from '@/dashboards/stock';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { usePublishNavBadges } from '@/shared/hooks/useNavBadges';
import { useSubPage } from '@/shared/hooks/useSubPage';
import { cn } from '@/shared/lib/utils';

const OverviewView = lazy(() => import('@/dashboards/stock/views/OverviewView'));
const ProjectionsView = lazy(() => import('@/dashboards/stock/views/ProjectionsView'));
const StockoutsView = lazy(() => import('@/dashboards/stock/views/StockoutsView'));

const TABS = STOCK_PAGES.map((p) => p.id);

type StatusScope = 'live' | 'bestseller' | 'all' | 'discontinued';

const SUBTITLES: Record<StockTab, string> = {
  overview:
    'Live inventory across Dankuni & Chennai warehouses — click any product for its stock trajectory & 3-month forecast',
  projections:
    '3-month (90-day) demand forecast, exact stockout dates, and replenishment requirements',
  stockouts:
    'Unavailable products, days out of stock, and estimated units lost during stockout days',
};

const ALLOWED_STATUSES: Record<StatusScope, Set<ProductStatus>> = {
  live: new Set(['Bestseller', 'Active']),
  bestseller: new Set(['Bestseller']),
  all: new Set(['Bestseller', 'Active', 'Recovered', 'Discontinued']),
  discontinued: new Set(['Discontinued', 'Recovered']),
};

export default function StockPage() {
  const { payload, source, fetchedAt, syncing, loading, error, isLiveConfigured, refresh } =
    useStockData();
  // Live sync failed but recent (≤2h) last-fetched data is on screen.
  const isFallback = Boolean(error && payload);
  const isLastSaved = source === 'last-saved';
  const { page: tab, select: setTab } = useSubPage(TABS, 'overview');

  const [searchParams] = useSearchParams();
  const [warehouse, setWarehouse] = useState<WarehouseScope>(() => {
    const wh = searchParams.get('warehouse');
    return wh === 'dankuni' || wh === 'chennai' ? wh : 'all';
  });
  const [statusScope, setStatusScope] = useState<StatusScope>('live');
  const [velocityWindow, setVelocityWindow] = useState<VelocityWindow>(30);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('sku'));
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const summary = useMemo(
    () =>
      buildStockDashboardSummary(payload ?? EMPTY_STOCK_PAYLOAD, {
        warehouse,
        velocityWindow,
      }),
    [payload, warehouse, velocityWindow],
  );

  const visibleProducts = useMemo(() => {
    const allowed = ALLOWED_STATUSES[statusScope];
    return summary.products.filter((p) => allowed.has(p.status));
  }, [summary.products, statusScope]);

  const badgeCounts = useMemo(() => {
    const oos = visibleProducts.filter((p) => p.isOutOfStock).length;
    const needRestock = visibleProducts.filter((p) => p.reorderNeeded90d > 0).length;
    return { oos, needRestock };
  }, [visibleProducts]);

  usePublishNavBadges('stock', {
    overview: { n: visibleProducts.length },
    projections: { n: badgeCounts.needRestock, alert: badgeCounts.needRestock > 0 },
    stockouts: { n: badgeCounts.oos, alert: badgeCounts.oos > 0 },
  });

  const selectedProduct = useMemo(
    () => summary.products.find((p) => p.id === selectedId) ?? null,
    [summary.products, selectedId],
  );

  const pageLabel = STOCK_PAGES.find((p) => p.id === tab)?.label ?? 'Warehouse Stock';

  return (
    <div className="bg-grid flex min-h-full min-w-0 flex-col gap-3 p-3 md:p-4">
      {/* ── Top Header & Global Controls ── */}
      <div className="flex flex-none flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{pageLabel}</h1>
            {/* Sub-page pill switcher (also works on /tv/stock where sidebar is hidden) */}
            <div className="inline-flex rounded-lg border border-border bg-card/70 p-0.5 text-xs">
              {STOCK_PAGES.map((p) => {
                const Icon = p.icon;
                const active = tab === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setTab(p.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{SUBTITLES[tab]}</p>
        </div>

        {/* Warehouse, Status, Velocity Window & Sync Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Warehouse selector */}
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs">
            {(
              [
                ['all', 'All Warehouses'],
                ['dankuni', 'Dankuni'],
                ['chennai', 'Chennai'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setWarehouse(id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  warehouse === id
                    ? 'bg-muted font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Product Status selector (defaults to Bestseller + Active) */}
          <select
            value={statusScope}
            onChange={(e) => setStatusScope(e.target.value as StatusScope)}
            aria-label="Filter product status"
            className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="live">Bestseller + Active</option>
            <option value="bestseller">Bestsellers Only</option>
            <option value="all">All Statuses (incl. Discontinued)</option>
            <option value="discontinued">Discontinued & Recovered Only</option>
          </select>

          {/* Velocity window selector */}
          <div
            className="inline-flex items-center rounded-lg border border-border bg-card p-0.5 text-xs"
            title="Lookback window of in-stock days used to compute daily sales velocity"
          >
            <span className="px-2 text-[11px] text-muted-foreground">Velocity:</span>
            {([30, 60, 90] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setVelocityWindow(w)}
                className={cn(
                  'rounded-md px-2 py-1 font-mono text-xs font-medium transition-colors',
                  velocityWindow === w
                    ? 'bg-muted font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {w}d
              </button>
            ))}
          </div>

          {/* Data source & Last Sync Time badge */}
          <button
            type="button"
            onClick={() => setShowSetupModal(true)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
              isLastSaved
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : error
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                  : isLiveConfigured
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
            title={
              isLastSaved
                ? `Live sync failed — showing the last fetched data (${new Date(fetchedAt ?? 0).toLocaleString('en-IN')}). Click ↻ to retry.`
                : error && payload
                  ? `Latest sync failed (${error}). Showing data synced ${new Date(fetchedAt ?? 0).toLocaleString('en-IN')}. Click ↻ to retry.`
                  : fetchedAt
                    ? `Last synced: ${new Date(fetchedAt).toLocaleString('en-IN')} · Auto-refreshes every 5m`
                    : 'Click for Google Apps Script proxy connection details'
            }
          >
            <span
              className={cn(
                'size-2 rounded-full',
                syncing && 'animate-pulse',
                isLastSaved
                  ? 'bg-amber-400'
                  : error
                    ? 'bg-rose-400'
                    : isLiveConfigured
                      ? 'bg-emerald-400'
                      : 'bg-sky-400',
              )}
            />
            <span className="font-mono text-[11px] tabular-nums">
              {loading
                ? 'Loading…'
                : syncing
                  ? 'Syncing…'
                  : isLastSaved
                    ? `Last fetched · ${fmtSyncTime(fetchedAt, nowMs)}`
                    : error
                      ? payload
                        ? `Sync failed · ${fmtSyncTime(fetchedAt, nowMs)}`
                        : 'Sync failed'
                      : `Synced ${fmtSyncTime(fetchedAt, nowMs)}`}
            </span>
            <Info className="size-3.5 opacity-70" />
          </button>

          <button
            type="button"
            onClick={refresh}
            disabled={syncing}
            title={
              fetchedAt
                ? `Last updated ${new Date(fetchedAt).toLocaleString('en-IN')}`
                : 'Refresh stock data'
            }
            aria-label="Refresh stock data"
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('size-4', syncing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {!payload ? (
        loading || !error ? (
          /* ── Loading: never show old numbers while fresh sheet data is on its way ── */
          <StockLoader />
        ) : (
          /* ── Fetch failed and nothing loaded ── */
          <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/5 p-6 text-center">
            <AlertTriangle className="size-6 text-rose-400" />
            <div className="text-sm font-semibold text-foreground">Couldn't load stock data</div>
            <p className="text-xs text-muted-foreground">
              The Google Sheets connection failed ({error}) and there is no data from the last 2
              hours to fall back on. Older data is hidden so it can't be mistaken for current stock.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={refresh}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground"
              >
                <RefreshCw className="size-3.5" />
                Retry
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          {isFallback && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="size-4 text-amber-400" />
                Live sync failed — showing the last fetched data from{' '}
                {new Date(fetchedAt ?? 0).toLocaleString('en-IN')} ({fmtSyncTime(fetchedAt, nowMs)}
                ). Recent changes in the sheet may be missing.
              </span>
              <button
                type="button"
                onClick={refresh}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 font-medium hover:bg-amber-500/10"
              >
                <RefreshCw className="size-3.5" />
                Retry
              </button>
            </div>
          )}

          {/* ── Chennai stock cross-check: Dankuni Total Stock Col G vs Chennai CURRENT tab ── */}
          {warehouse !== 'dankuni' &&
            summary.chennaiVerification.currentTabAvailable &&
            (() => {
              const v = summary.chennaiVerification;
              const issues =
                v.mismatches.length + v.missingFromCatalog.length + v.sheetGOnly.length;
              if (issues === 0) {
                return (
                  <div className="inline-flex items-center gap-1.5 self-start rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 text-[11px] text-emerald-300">
                    <CircleCheck className="size-3.5" />
                    Chennai stock verified · {v.verifiedCount} SKU{v.verifiedCount === 1 ? '' : 's'}{' '}
                    match in both Dankuni Total Stock (Col G) and the Chennai CURRENT tab
                  </div>
                );
              }
              return (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="size-4 text-amber-400" />
                    Chennai stock doesn't match between the two sheets ({issues} issue
                    {issues === 1 ? '' : 's'}) · {v.verifiedCount} verified
                  </div>
                  <ul className="mt-1.5 space-y-0.5 pl-5 font-mono text-[11px] text-amber-100/90">
                    {v.mismatches.map((m) => (
                      <li key={m.sku}>
                        {m.sku}: CURRENT tab {fmtUnits(m.currentTab)} ≠ Col G {fmtUnits(m.sheetG)}{' '}
                        <span className="text-amber-300/70">(showing CURRENT tab)</span>
                      </li>
                    ))}
                    {v.missingFromCatalog.map((m) => (
                      <li key={m.sku}>
                        {m.sku}: {fmtUnits(m.stock)} in the Chennai CURRENT tab but no row in
                        Dankuni Total Stock{' '}
                        <span className="text-amber-300/70">(not shown, add it)</span>
                      </li>
                    ))}
                    {v.sheetGOnly.map((m) => (
                      <li key={m.sku}>
                        {m.sku}: {fmtUnits(m.stock)} in Col G but missing from the Chennai CURRENT
                        tab
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

          {/* ── Active Sub-Page View ── */}
          <div key={tab} className="animate-fade-in-up min-w-0 flex-1">
            <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
              {tab === 'overview' && (
                <OverviewView
                  products={visibleProducts}
                  onSelectProduct={setSelectedId}
                  onNavigate={setTab}
                />
              )}
              {tab === 'projections' && (
                <ProjectionsView products={visibleProducts} onSelectProduct={setSelectedId} />
              )}
              {tab === 'stockouts' && (
                <StockoutsView products={visibleProducts} onSelectProduct={setSelectedId} />
              )}
            </Suspense>
          </div>
        </>
      )}

      {/* ── Product Deep-Dive Right-Side Slide-Over Drawer ── */}
      <ProductStockModal
        product={selectedProduct}
        list={visibleProducts}
        onSelect={setSelectedId}
        onClose={() => setSelectedId(null)}
      />

      {/* ── Apps Script Live Proxy Setup Slide-Over Sheet ── */}
      <Dialog open={showSetupModal} onOpenChange={setShowSetupModal}>
        <DialogContent side="right" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Private Google Sheets Connection (Apps Script Proxy)
            </DialogTitle>
            <DialogDescription>
              Live sync via Google Apps Script without opening sheet link sharing
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3 text-xs leading-relaxed text-muted-foreground">
              <p>
                Because the Dankuni and Chennai stock sheets are private (restricted link sharing),
                this dashboard uses a lightweight{' '}
                <strong className="text-foreground">Google Apps Script Web App proxy</strong> that
                runs under your Google account with zero changes needed from the sheet maintainer.
              </p>
              <ol className="list-decimal space-y-1.5 pl-4 text-foreground">
                <li>
                  Open <code className="rounded bg-muted px-1 py-0.5">https://script.google.com</code>{' '}
                  and create a new project.
                </li>
                <li>
                  Paste the contents of{' '}
                  <code className="rounded bg-muted px-1 py-0.5">scripts/stock-apps-script.gs</code>{' '}
                  into <code className="rounded bg-muted px-1 py-0.5">Code.gs</code>.
                </li>
                <li>
                  Click <strong>Deploy → New deployment → Web app</strong>, set{' '}
                  <strong>Execute as: Me</strong> and <strong>Who has access: Anyone</strong>, then
                  copy the Web App URL.
                </li>
                <li>
                  Set <code className="rounded bg-muted px-1 py-0.5">VITE_STOCK_APPS_SCRIPT_URL</code>{' '}
                  in <code className="rounded bg-muted px-1 py-0.5">.env</code> and Vercel.
                </li>
              </ol>
              <p className="mt-1 rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]">
                You can also refresh the bundled snapshot locally anytime via your signed-in{' '}
                <code className="text-foreground">gsheets</code> CLI by running{' '}
                <code className="text-foreground">node scripts/sync-stock-snapshot.mjs</code>.
              </p>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

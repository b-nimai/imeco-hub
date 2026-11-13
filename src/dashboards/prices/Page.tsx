import { RefreshCw } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { Freshness } from '@/dashboards/prices/components/Freshness';
import { usePriceData } from '@/dashboards/prices/hooks/usePriceData';
import { PRICE_PAGES, type PriceTab } from '@/dashboards/prices';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { usePublishNavBadges } from '@/shared/hooks/useNavBadges';
import { useSubPage } from '@/shared/hooks/useSubPage';
import { cn } from '@/shared/lib/utils';

// Every page is code-split, so the first paint downloads only what it shows.
const OverviewView = lazy(() => import('@/dashboards/prices/views/OverviewView'));
const PricesView = lazy(() => import('@/dashboards/prices/views/PricesView'));
const TrendsView = lazy(() => import('@/dashboards/prices/views/TrendsView'));
const AvailabilityView = lazy(() => import('@/dashboards/prices/views/AvailabilityView'));
const ReviewsView = lazy(() => import('@/dashboards/prices/views/ReviewsView'));
const CompetitorsView = lazy(() => import('@/dashboards/prices/views/CompetitorsView'));
const SearchView = lazy(() => import('@/dashboards/prices/views/SearchView'));

const TABS = PRICE_PAGES.map((p) => p.id);

const SUBTITLES: Record<PriceTab, string> = {
  overview: 'Today across prices, stock, rivals, ratings and search — click anything to dig in',
  prices: 'Live price of every product on every marketplace',
  trends: 'How prices have moved — click a product for its chart',
  availability: 'In-stock share by marketplace and Blinkit dark store',
  reviews: 'Star ratings and how they are changing',
  competitors: 'IMECO against its rivals, product by product',
  search: 'Where IMECO ranks when shoppers search — once a day',
};

/**
 * Shown whenever the dashboard is rendering the captured scrape instead of the database.
 *
 * Deliberately loud and permanent. Demo prices are real numbers from a real run, which makes
 * them *more* dangerous to mistake for live ones, not less — someone could reprice against a
 * frozen snapshot without ever noticing.
 */
function DemoBanner() {
  return (
    <div className="flex-none rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-[11px] tracking-widest text-warn uppercase">
      Demo data — not live. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect the
      database.
    </div>
  );
}

/** Page title row: name and one line of context on the left, the page's own controls right. */
function PageHeader({ tab, actions }: { tab: PriceTab; actions?: ReactNode }) {
  const label = PRICE_PAGES.find((p) => p.id === tab)!.label;
  return (
    <div className="flex flex-none flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{label}</h1>
        <p className="text-xs text-muted-foreground">{SUBTITLES[tab]}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/**
 * Old price-tracker links were `#prices`, `#trends`, … Forward them to the routed path so
 * bookmarks and the old wall-display URL keep working.
 */
function useLegacyHashRedirect(base: string) {
  const navigate = useNavigate();
  useEffect(() => {
    const hash = window.location.hash.slice(1) as PriceTab;
    if (hash && TABS.includes(hash)) navigate(`${base}/${hash}`, { replace: true });
  }, [base, navigate]);
}

export default function PricesPage() {
  const { data, syncing, error, demo, refresh } = usePriceData();
  const [showUnlisted, setShowUnlisted] = useState(true);
  const { page: tab, select: setTab, base } = useSubPage(TABS, 'overview');
  useLegacyHashRedirect(base);

  usePublishNavBadges('prices', {
    prices: { n: data?.totals.live },
    availability: { n: data?.totals.outOfStock, alert: true },
  });

  const unlistedCount = useMemo(
    () => (data ? data.rows.filter((r) => r.liveCount === 0).length : 0),
    [data],
  );

  const status = (
    <>
      <Freshness checkedAt={data?.checkedAt ?? null} syncing={syncing} error={error} />
      <button
        type="button"
        onClick={refresh}
        disabled={syncing}
        title="Refresh from the database"
        aria-label="Refresh from the database"
        className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={cn('size-4', syncing && 'animate-spin')} />
      </button>
    </>
  );

  const pricesActions = data && (
    <>
      <span
        className="rounded-lg border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
        title={`${data.totals.live} of ${data.totals.listed} tracked listings returned a live price`}
      >
        <span className="font-mono text-sm font-bold text-foreground tabular-nums">
          {data.totals.live}/{data.totals.listed}
        </span>{' '}
        listings live
        {data.totals.outOfStock > 0 && ` · ${data.totals.outOfStock} out of stock`}
      </span>
      {unlistedCount > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showUnlisted} onCheckedChange={setShowUnlisted} />
          Show {unlistedCount} unlisted
        </label>
      )}
    </>
  );

  return (
    <div className="bg-grid flex min-h-full min-w-0 flex-col gap-3 p-3 md:p-4">
      <PageHeader
        tab={tab}
        actions={
          <>
            {tab === 'prices' && pricesActions}
            {status}
          </>
        }
      />

      {demo && <DemoBanner />}

      {!data ? (
        <Skeleton className="min-h-96 flex-1 rounded-xl" />
      ) : (
        <div key={tab} className="animate-fade-in-up min-w-0">
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            {tab === 'overview' && (
              <OverviewView
                rows={data.rows}
                competitors={data.competitors}
                totals={data.totals}
                onNavigate={setTab}
              />
            )}
            {tab === 'prices' && <PricesView rows={data.rows} showUnlisted={showUnlisted} />}
            {tab === 'trends' && <TrendsView rows={data.rows} />}
            {tab === 'availability' && <AvailabilityView rows={data.rows} />}
            {tab === 'reviews' && <ReviewsView rows={data.rows} competitors={data.competitors} />}
            {tab === 'competitors' && (
              <CompetitorsView rows={data.rows} competitors={data.competitors} />
            )}
            {tab === 'search' && <SearchView />}
          </Suspense>
        </div>
      )}
    </div>
  );
}

import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Info,
  Tv,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { dashboards } from '@/app/registry';
import { MARKETPLACES } from '@/dashboards/prices/data/types';
import { usePriceData } from '@/dashboards/prices/hooks/usePriceData';
import { fmtCompact, fmtShortDate, fmtUnits, fmtVelocity } from '@/dashboards/stock/data/format';
import { buildStockDashboardSummary } from '@/dashboards/stock/data/parseStock';
import { useStockData } from '@/dashboards/stock/hooks/useStockData';
import { cn } from '@/shared/lib/utils';

type Severity = 'critical' | 'high' | 'medium' | 'watch';

interface ActionItem {
  id: string;
  severity: Severity;
  /** Higher weight sorts first (Critical = 90..100, High = 70..89, Medium = 40..69, Watch = 10..39) */
  weight: number;
  dashboardId: string;
  dashboardLabel: string;
  areaLabel: string;
  title: string;
  detail: string;
  metricBadge: string;
  to: string;
}

const SEVERITY_META: Record<
  Severity,
  {
    label: string;
    rank: number;
    badgeClass: string;
    borderClass: string;
    dotClass: string;
    icon: typeof AlertOctagon;
  }
> = {
  critical: {
    label: 'Critical',
    rank: 1,
    badgeClass: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
    borderClass: 'border-l-4 border-l-rose-500 border-border/80 bg-rose-500/[0.04]',
    dotClass: 'bg-rose-500',
    icon: AlertOctagon,
  },
  high: {
    label: 'High Priority',
    rank: 2,
    badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    borderClass: 'border-l-4 border-l-amber-400 border-border/80 bg-amber-500/[0.03]',
    dotClass: 'bg-amber-400',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Medium',
    rank: 3,
    badgeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
    borderClass: 'border-l-4 border-l-sky-400 border-border/80 bg-card/60',
    dotClass: 'bg-sky-400',
    icon: Clock,
  },
  watch: {
    label: 'Routine / Watch',
    rank: 4,
    badgeClass: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300',
    borderClass: 'border-l-4 border-l-emerald-500/60 border-border/70 bg-card/40',
    dotClass: 'bg-emerald-400',
    icon: Info,
  },
};

export function Home() {
  const { payload: stockPayload } = useStockData();
  const { data: priceData } = usePriceData();

  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [dashFilter, setDashFilter] = useState<string>('all');

  const stockSummary = useMemo(
    () => buildStockDashboardSummary(stockPayload, { warehouse: 'all', velocityWindow: 30 }),
    [stockPayload],
  );

  const actions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];
    const liveProducts = stockSummary.products.filter(
      (p) => p.status === 'Bestseller' || p.status === 'Active',
    );

    // 1. CRITICAL: Out-of-Stock Bestsellers & High-Velocity Active SKUs
    const oosProducts = liveProducts
      .filter((p) => p.isOutOfStock && (p.preOosVelocity > 0 || p.status === 'Bestseller'))
      .sort(
        (a, b) =>
          b.lostUnitsCurrentOos +
          b.projectedStockLoss90d -
          (a.lostUnitsCurrentOos + a.projectedStockLoss90d),
      );

    for (const p of oosProducts) {
      const isBestseller = p.status === 'Bestseller';
      const severity: Severity = isBestseller || p.preOosVelocity >= 20 ? 'critical' : 'high';
      const weight =
        (severity === 'critical' ? 95 : 80) + Math.min(4.9, p.preOosVelocity / 100);

      items.push({
        id: `stock-oos-${p.id}`,
        severity,
        weight,
        dashboardId: 'stock',
        dashboardLabel: 'Warehouse Stock',
        areaLabel: 'Stock Loss (OOS)',
        title: `Restock ${p.shortName} (${p.sku}) — Out of Stock`,
        detail:
          p.currentOosDays > 0
            ? `Unavailable for ${p.currentOosDays} days (since ${fmtShortDate(p.oosSinceDate)}) at ${fmtVelocity(p.preOosVelocity)} pre-OOS burn · Est. ${fmtUnits(p.lostUnitsCurrentOos)} units already lost and ${fmtUnits(p.projectedStockLoss90d)} units at risk over 90d.`
            : `Currently 0 stock across Dankuni & Chennai · 90-day demand is ${fmtUnits(p.demand90d)} units.`,
        metricBadge:
          p.lostUnitsCurrentOos > 0
            ? `-${fmtCompact(p.lostUnitsCurrentOos)} u lost (${p.currentOosDays}d OOS)`
            : `Need +${fmtCompact(p.demand90d)} u`,
        to: `/stock/stockouts?scope=unavailable_now&sku=${encodeURIComponent(p.id)}`,
      });
    }

    // 2. CRITICAL / HIGH: Products Running Out Within < 30 Days
    const criticalRunway = liveProducts
      .filter((p) => !p.isOutOfStock && p.daysOfCover !== null && p.daysOfCover < 30)
      .sort((a, b) => (a.daysOfCover ?? 99) - (b.daysOfCover ?? 99));

    for (const p of criticalRunway) {
      const days = p.daysOfCover ?? 0;
      const isUrgent = days <= 14 || p.status === 'Bestseller';
      const severity: Severity = isUrgent ? 'critical' : 'high';
      const weight = (isUrgent ? 90 : 78) + Math.max(0, (30 - days) / 10);

      items.push({
        id: `stock-runway-${p.id}`,
        severity,
        weight,
        dashboardId: 'stock',
        dashboardLabel: 'Warehouse Stock',
        areaLabel: '3M Projection (<30d Runway)',
        title: `Urgent Replenishment: ${p.shortName} (${p.sku}) depletes in ${days} days`,
        detail: `Current stock ${fmtUnits(p.currentStock)} u burning at ${fmtVelocity(p.dailyVelocity)} · Projected stockout on ${fmtShortDate(p.projectedRunoutDate, true)} · Needs +${fmtUnits(p.reorderNeeded90d)} u for 3-month cover${p.packagingShortfall90d > 0 ? ` (Packaging short by ${fmtUnits(p.packagingShortfall90d)} boxes)` : ''}.`,
        metricBadge: `${days}d cover left · Need +${fmtCompact(p.reorderNeeded90d)}`,
        to: `/stock/projections?mode=critical_30d&sku=${encodeURIComponent(p.id)}`,
      });
    }

    // 3. HIGH: Price Tracker Marketplace OOS & Below-Target SP Alerts
    if (priceData) {
      if (priceData.totals.outOfStock > 0) {
        items.push({
          id: 'prices-marketplace-oos',
          severity: 'high',
          weight: 82,
          dashboardId: 'prices',
          dashboardLabel: 'Price Tracker',
          areaLabel: 'Stock Availability',
          title: `${priceData.totals.outOfStock} Marketplace Listings Out of Stock`,
          detail: `${priceData.totals.live} of ${priceData.totals.listed} tracked listings are live across Amazon, Flipkart, Blinkit & BigBasket; ${priceData.totals.outOfStock} listings are currently unavailable to shoppers.`,
          metricBadge: `${priceData.totals.outOfStock} listings OOS`,
          to: '/prices/availability',
        });
      }

      const belowTargetCount = priceData.rows.reduce(
        (n, r) =>
          n +
          MARKETPLACES.filter((m) => {
            const c = r.cells[m];
            return (
              c.status === 'ok' && c.price != null && c.targetSp && c.price < c.targetSp * 0.95
            );
          }).length,
        0,
      );

      if (belowTargetCount > 0) {
        items.push({
          id: 'prices-below-target',
          severity: 'high',
          weight: 74,
          dashboardId: 'prices',
          dashboardLabel: 'Price Tracker',
          areaLabel: 'Price Trends & Targets',
          title: `${belowTargetCount} Listings Selling 5%+ Below Target SP`,
          detail: `Marketplace prices have dropped at least 5% under the sheet's intended selling price on ${belowTargetCount} active listings.`,
          metricBadge: `${belowTargetCount} under SP`,
          to: '/prices/trends',
        });
      }
    }

    // 4. MEDIUM: 30–90 Day Reorder Window (Needs 3-Month Production Batch)
    const reorderWindow = liveProducts
      .filter(
        (p) =>
          !p.isOutOfStock &&
          p.daysOfCover !== null &&
          p.daysOfCover >= 30 &&
          p.daysOfCover < 90 &&
          p.reorderNeeded90d > 0,
      )
      .sort((a, b) => (a.daysOfCover ?? 99) - (b.daysOfCover ?? 99));

    for (const p of reorderWindow) {
      const days = p.daysOfCover ?? 60;
      items.push({
        id: `stock-reorder90-${p.id}`,
        severity: 'medium',
        weight: 60 + (90 - days) / 10,
        dashboardId: 'stock',
        dashboardLabel: 'Warehouse Stock',
        areaLabel: '3M Projection (30–90d)',
        title: `Plan 3-Month Batch: ${p.shortName} (${p.sku}) — ${days}d runway`,
        detail: `${fmtUnits(p.currentStock)} u in stock (${fmtVelocity(p.dailyVelocity)}) · Will run out on ${fmtShortDate(p.projectedRunoutDate, true)} (${p.projectedOosDays90d} OOS days inside 90d window) without +${fmtUnits(p.reorderNeeded90d)} u restock.`,
        metricBadge: `${days}d cover · +${fmtCompact(p.reorderNeeded90d)} u for 3M`,
        to: `/stock/projections?mode=needs_reorder&sku=${encodeURIComponent(p.id)}`,
      });
    }

    // 5. MEDIUM: Chennai Warehouse Stock Coverage Gap
    items.push({
      id: 'stock-chennai-gap',
      severity: 'medium',
      weight: 48,
      dashboardId: 'stock',
      dashboardLabel: 'Warehouse Stock',
      areaLabel: 'Chennai Warehouse',
      title: 'Chennai Warehouse: 2 of 3 Tracked SKUs Have 0 Local Stock',
      detail:
        'IMEFTCNP600 has 37,428 units in Chennai, while IMEGHFT600 and IMEGHTT have 0 received stock in Chennai despite B2C orders.',
      metricBadge: '2 SKUs at 0 in Chennai',
      to: '/stock?warehouse=chennai',
    });

    // 6. WATCH / ROUTINE: Sales, Dispatch & Billing Checks
    items.push(
      {
        id: 'sales-pace-check',
        severity: 'watch',
        weight: 30,
        dashboardId: 'sales',
        dashboardLabel: 'Sales Mission Control',
        areaLabel: 'Revenue Pace & ROAS',
        title: 'Review Month-to-Date Revenue Pace vs Target & Channel Ad Spend',
        detail:
          'Monitor daily run-rate required to hit the monthly DSR target and check D2C / Marketplace ROAS.',
        metricBadge: 'Daily DSR & Growth',
        to: '/sales',
      },
      {
        id: 'dispatch-heatmap-check',
        severity: 'watch',
        weight: 25,
        dashboardId: 'dispatch',
        dashboardLabel: 'Marketplace Dispatch',
        areaLabel: 'Monthly Outbound Heatmap',
        title: 'Audit Zero-Dispatch SKUs & Channel Outbound Mix This Month',
        detail:
          'Check products with zero monthly dispatches and verify dated PO dispatches across Blinkit, Amazon, Flipkart & FBF.',
        metricBadge: 'Outbound Heatmap',
        to: '/dispatch',
      },
      {
        id: 'billing-margin-check',
        severity: 'watch',
        weight: 20,
        dashboardId: 'billing',
        dashboardLabel: 'B2B Billing',
        areaLabel: 'Channel Billing & GST',
        title: 'Verify B2B Channel Billing Rates & GST Landing Costs',
        detail:
          'Inspect per-unit B2B billing prices and margin spread across institutional and marketplace B2B channels.',
        metricBadge: 'B2B Cost Sheet',
        to: '/billing',
      },
    );

    // Strictly sort from most critical (highest weight / rank 1) to least critical (lowest weight / rank 4)
    return items.sort((a, b) => {
      const rankDiff = SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank;
      if (rankDiff !== 0) return rankDiff;
      return b.weight - a.weight;
    });
  }, [stockSummary, priceData]);

  const counts = useMemo(() => {
    const out = { critical: 0, high: 0, medium: 0, watch: 0 };
    for (const a of actions) out[a.severity] += 1;
    return out;
  }, [actions]);

  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (dashFilter !== 'all' && a.dashboardId !== dashFilter) return false;
      return true;
    });
  }, [actions, severityFilter, dashFilter]);

  return (
    <div className="bg-grid flex min-h-full flex-col gap-4 p-3 md:p-6">
      {/* ── Top Header: Title + Criticality Summary + Compact Wall TV Launcher ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Mission Control
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {counts.critical > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-rose-300">
                  <span className="size-1.5 animate-pulse rounded-full bg-rose-400" />
                  {counts.critical} Critical
                </span>
              )}
              {counts.high > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-300">
                  {counts.high} High
                </span>
              )}
              {counts.medium > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
                  {counts.medium} Medium
                </span>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Immediate operational actions ordered from most critical to least critical — click any
            issue to jump straight to its source view
          </p>
        </div>

        {/* Compact Wall TV Mode Bar */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/80 bg-card/60 px-2.5 py-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5 pr-1 text-[11px] font-medium text-muted-foreground">
            <Tv className="size-3.5 text-primary" />
            Wall TV Mode:
          </span>
          {dashboards.map(({ id, label }) => (
            <Link
              key={id}
              to={`/tv/${id}`}
              title={`Open ${label} in full-screen Wall TV mode`}
              className="rounded-md border border-transparent bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
            >
              {label.replace(' Mission Control', '').replace('Marketplace ', '')}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Priority Action Center (Critical First → Less Critical Last) ── */}
      <section className="card-glass flex flex-col gap-3.5 rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-foreground uppercase">
              Immediate Actions Required ({filteredActions.length})
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ranked strictly by urgency: Out-of-Stock Bestsellers &amp; &lt;14d Stockouts first →
              Marketplace OOS &amp; Price Drops → 30–90d Reorders → Routine Checks last.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Severity Filter Pills */}
            <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/35 p-0.5 text-xs">
              {(
                [
                  ['all', `All (${actions.length})`],
                  ['critical', `Critical (${counts.critical})`],
                  ['high', `High (${counts.high})`],
                  ['medium', `Medium (${counts.medium})`],
                  ['watch', `Watch (${counts.watch})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSeverityFilter(key)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    severityFilter === key
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Dashboard Source Filter */}
            <select
              value={dashFilter}
              onChange={(e) => setDashFilter(e.target.value)}
              aria-label="Filter actions by dashboard"
              className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Dashboards</option>
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Ordered Action Rows */}
        <div className="flex flex-col gap-2">
          {filteredActions.map((item, idx) => {
            const meta = SEVERITY_META[item.severity];
            const SevIcon = meta.icon;
            return (
              <Link
                key={item.id}
                to={item.to}
                className={cn(
                  'group flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md lg:flex-row lg:items-center',
                  meta.borderClass,
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1">
                    <span className="font-mono text-[10px] font-bold text-muted-foreground tabular-nums">
                      #{idx + 1}
                    </span>
                    <SevIcon
                      className={cn(
                        'size-4',
                        item.severity === 'critical'
                          ? 'text-rose-400'
                          : item.severity === 'high'
                            ? 'text-amber-400'
                            : item.severity === 'medium'
                              ? 'text-sky-400'
                              : 'text-emerald-400',
                      )}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                          meta.badgeClass,
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                        {item.dashboardLabel}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        → {item.areaLabel}
                      </span>
                    </div>

                    <h3 className="mt-1.5 text-sm font-semibold text-foreground group-hover:text-primary">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/50 pt-2 lg:border-t-0 lg:pt-0">
                  <span
                    className={cn(
                      'rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold tabular-nums',
                      meta.badgeClass,
                    )}
                  >
                    {item.metricBadge}
                  </span>

                  <span className="inline-flex items-center gap-1 rounded-lg bg-primary/12 px-3 py-1.5 text-xs font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    Go to Area
                    <ArrowUpRight className="size-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}

          {filteredActions.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-400" />
              No action items match this filter.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  CalendarClock,
  Flame,
  LayoutGrid,
  List,
  PackageCheck,
  PackageX,
  Search,
  Warehouse,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { ChennaiCheckBadge } from '@/dashboards/stock/components/ChennaiCheckBadge';
import { MiniStockSparkline } from '@/dashboards/stock/components/StockTrajectoryChart';
import {
  fmtCompact,
  fmtShortDate,
  fmtUnits,
  fmtVelocity,
  HEALTH_META,
  STATUS_BADGE,
} from '@/dashboards/stock/data/format';
import type { ProductStockAnalytics, StockHealth } from '@/dashboards/stock/data/types';
import type { StockTab } from '@/dashboards/stock';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { cn } from '@/shared/lib/utils';

type SortKey =
  | 'stock_desc'
  | 'stock_asc'
  | 'velocity_desc'
  | 'cover_asc'
  | 'loss_desc'
  | 'name_asc';

export default function OverviewView({
  products,
  onSelectProduct,
  onNavigate,
}: {
  products: ProductStockAnalytics[];
  onSelectProduct: (id: string) => void;
  onNavigate: (tab: StockTab) => void;
}) {
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<StockHealth | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('velocity_desc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products],
  );

  // Compute aggregate KPIs across the currently filtered status/warehouse set
  const kpis = useMemo(() => {
    const totalCurrent = products.reduce((s, p) => s + p.currentStock, 0);
    const totalDankuni = products.reduce((s, p) => s + p.dankuniStock, 0);
    const totalChennai = products.reduce((s, p) => s + p.chennaiStock, 0);
    const totalOldLogo = products.reduce((s, p) => s + p.oldLogoStock, 0);
    const inStockCount = products.filter((p) => !p.isOutOfStock).length;
    const oosCount = products.filter((p) => p.isOutOfStock).length;
    const criticalCount = products.filter((p) => p.health === 'critical').length;
    const warningCount = products.filter((p) => p.health === 'warning').length;
    const healthyCount = products.filter((p) => p.health === 'healthy').length;
    const dailyBurn = products.reduce((s, p) => s + p.dailyVelocity, 0);
    const demand90d = products.reduce((s, p) => s + p.demand90d, 0);
    const reorder90d = products.reduce((s, p) => s + p.reorderNeeded90d, 0);
    const currentOosLoss = products.reduce((s, p) => s + p.lostUnitsCurrentOos, 0);
    const histOosLoss = products.reduce((s, p) => s + p.lostUnitsHistoricalTotal, 0);
    return {
      totalCurrent,
      totalDankuni,
      totalChennai,
      totalOldLogo,
      inStockCount,
      oosCount,
      criticalCount,
      warningCount,
      healthyCount,
      dailyBurn,
      demand90d,
      reorder90d,
      currentOosLoss,
      histOosLoss,
    };
  }, [products]);

  const urgentAlerts = useMemo(() => {
    return products
      .filter(
        (p) =>
          (p.health === 'out_of_stock' && (p.preOosVelocity > 0 || p.status === 'Bestseller')) ||
          p.health === 'critical',
      )
      .sort((a, b) => {
        if (a.health !== b.health) return a.health === 'out_of_stock' ? -1 : 1;
        return b.dailyVelocity - a.dailyVelocity;
      })
      .slice(0, 12);
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      if (healthFilter !== 'all' && p.health !== healthFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q) &&
        !p.category.toLowerCase().includes(q) &&
        !p.brand.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'stock_desc':
          return b.currentStock - a.currentStock;
        case 'stock_asc':
          return a.currentStock - b.currentStock;
        case 'velocity_desc':
          return b.dailyVelocity - a.dailyVelocity || b.currentStock - a.currentStock;
        case 'cover_asc': {
          const ca = a.daysOfCover ?? 999999;
          const cb = b.daysOfCover ?? 999999;
          return ca - cb || b.dailyVelocity - a.dailyVelocity;
        }
        case 'loss_desc':
          return (
            b.lostUnitsCurrentOos +
            b.projectedStockLoss90d -
            (a.lostUnitsCurrentOos + a.projectedStockLoss90d)
          );
        case 'name_asc':
          return a.shortName.localeCompare(b.shortName);
      }
    });
  }, [products, search, healthFilter, categoryFilter, sortBy]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* ── Top 6 KPI Cards ── */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 2xl:grid-cols-6">
        <div className="card-glass flex flex-col justify-between rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Current Stock</span>
            <Boxes className="size-4 text-emerald-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground tabular-nums">
            {fmtUnits(kpis.totalCurrent)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground tabular-nums">
            <span>Dankuni: {fmtCompact(kpis.totalDankuni)}</span>
            <span>· Chennai: {fmtCompact(kpis.totalChennai)}</span>
            {kpis.totalOldLogo > 0 && <span>· Old: {fmtCompact(kpis.totalOldLogo)}</span>}
          </div>
        </div>

        <div className="card-glass flex flex-col justify-between rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">SKUs In Stock</span>
            <Warehouse className="size-4 text-sky-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground tabular-nums">
            {kpis.inStockCount}
            <span className="text-base font-normal text-muted-foreground">
              {' '}
              / {products.length}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            <span className="font-semibold text-rose-400">{kpis.oosCount} unavailable</span> ·{' '}
            <span className="text-emerald-400">{kpis.healthyCount} healthy (90d+)</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('projections')}
          className="card-glass flex flex-col justify-between rounded-xl p-3.5 text-left transition-colors hover:border-primary/40"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Daily Run Rate</span>
            <Flame className="size-4 text-amber-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground tabular-nums">
            {fmtUnits(kpis.dailyBurn)}
            <span className="text-sm font-normal text-muted-foreground"> / day</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Est. 3M Demand: <strong className="text-foreground">{fmtCompact(kpis.demand90d)}</strong>{' '}
            units →
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('projections')}
          className="card-glass flex flex-col justify-between rounded-xl p-3.5 text-left transition-colors hover:border-primary/40"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Runway Risk (&lt;90d)</span>
            <CalendarClock className="size-4 text-amber-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-400 tabular-nums">
            {kpis.criticalCount + kpis.warningCount}
            <span className="text-sm font-normal text-muted-foreground"> SKUs</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            <span className="font-semibold text-amber-400">{kpis.criticalCount} &lt;30d</span> ·{' '}
            <span className="text-sky-400">{kpis.warningCount} in 30–90d</span> →
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('projections')}
          className="card-glass flex flex-col justify-between rounded-xl p-3.5 text-left transition-colors hover:border-primary/40"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">3M Restock Deficit</span>
            <PackageCheck className="size-4 text-purple-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground tabular-nums">
            {fmtCompact(kpis.reorder90d)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Units needed for 90-day cover →
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('stockouts')}
          className="card-glass flex flex-col justify-between rounded-xl border-rose-500/30 bg-rose-500/5 p-3.5 text-left transition-colors hover:border-rose-500/60"
        >
          <div className="flex items-center justify-between text-xs text-rose-300">
            <span className="font-medium uppercase tracking-wider">OOS Stock Loss</span>
            <PackageX className="size-4 text-rose-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-rose-400 tabular-nums">
            {fmtCompact(kpis.currentOosLoss)}
            <span className="text-sm font-normal text-rose-300/80"> units</span>
          </div>
          <div className="mt-1 text-[11px] text-rose-300/80">
            All-time OOS loss: {fmtCompact(kpis.histOosLoss)} u →
          </div>
        </button>
      </div>

      {/* ── Middle Row: 3-Month Runway Health Breakdown + Urgent Stockout Alerts ── */}
      <div className="grid gap-3 xl:grid-cols-5">
        <div className="card-glass flex flex-col justify-between gap-3 rounded-xl p-4 xl:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="eyebrow">3-Month Stock Runway & Warehouse Split</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Click any health tier below to filter the product catalogue.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('projections')}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Open 3-Month Planner →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(
              [
                ['out_of_stock', kpis.oosCount, 'Unavailable now (0 stock)'],
                ['critical', kpis.criticalCount, 'Will stock out in < 30 days'],
                ['warning', kpis.warningCount, 'Will stock out in 30–90 days'],
                ['healthy', kpis.healthyCount, 'Covered for 90+ days'],
              ] as const
            ).map(([key, count, desc]) => {
              const meta = HEALTH_META[key];
              const active = healthFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHealthFilter(active ? 'all' : key)}
                  className={cn(
                    'flex flex-col gap-1 rounded-xl border p-3 text-left transition-all',
                    active
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-border/70 bg-card/50 hover:border-border',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('text-xs font-semibold', meta.textClass)}>
                      {meta.shortLabel}
                    </span>
                    <span
                      className="size-2 rounded-full"
                      style={{ background: meta.dotColor }}
                    />
                  </div>
                  <div className="font-mono text-2xl font-bold text-foreground tabular-nums">
                    {count}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{desc}</div>
                </button>
              );
            })}
          </div>

          {/* Segmented progress bar */}
          {products.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${(kpis.healthyCount / products.length) * 100}%` }}
                  title={`Healthy (90d+): ${kpis.healthyCount}`}
                />
                <div
                  className="bg-sky-400 transition-all"
                  style={{ width: `${(kpis.warningCount / products.length) * 100}%` }}
                  title={`Reorder (30–90d): ${kpis.warningCount}`}
                />
                <div
                  className="bg-amber-400 transition-all"
                  style={{ width: `${(kpis.criticalCount / products.length) * 100}%` }}
                  title={`Critical (<30d): ${kpis.criticalCount}`}
                />
                <div
                  className="bg-rose-500 transition-all"
                  style={{ width: `${(kpis.oosCount / products.length) * 100}%` }}
                  title={`Out of Stock: ${kpis.oosCount}`}
                />
              </div>
              <div className="flex flex-wrap justify-between text-[11px] text-muted-foreground">
                <span>
                  Dankuni Share:{' '}
                  <strong className="font-mono text-foreground">
                    {kpis.totalDankuni + kpis.totalChennai > 0
                      ? `${Math.round((kpis.totalDankuni / (kpis.totalDankuni + kpis.totalChennai)) * 100)}%`
                      : '0%'}
                  </strong>{' '}
                  ({fmtUnits(kpis.totalDankuni)} u)
                </span>
                <span>
                  Chennai Share:{' '}
                  <strong className="font-mono text-foreground">
                    {kpis.totalDankuni + kpis.totalChennai > 0
                      ? `${Math.round((kpis.totalChennai / (kpis.totalDankuni + kpis.totalChennai)) * 100)}%`
                      : '0%'}
                  </strong>{' '}
                  ({fmtUnits(kpis.totalChennai)} u)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Urgent Stockout & Low Runway Feed */}
        <div className="card-glass flex flex-col gap-2.5 rounded-xl p-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-400" />
              <h2 className="eyebrow">Immediate Stockout & Runway Alerts</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stockouts')}
              className="rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Stock Loss Report →
            </button>
          </div>

          {urgentAlerts.length > 0 ? (
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1">
              {urgentAlerts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProduct(p.id)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/50 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: HEALTH_META[p.health].dotColor }}
                      />
                      <span className="truncate font-medium text-foreground">{p.shortName}</span>
                    </div>
                    <div className="mt-0.5 pl-3.5 text-[11px] text-muted-foreground">
                      {p.isOutOfStock
                        ? `OOS for ${p.currentOosDays}d · Est. loss: ${fmtUnits(p.lostUnitsCurrentOos)} u`
                        : `${p.daysOfCover}d cover left (${fmtUnits(p.currentStock)} u at ${fmtVelocity(p.dailyVelocity)})`}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums',
                      HEALTH_META[p.health].badgeClass,
                    )}
                  >
                    {p.isOutOfStock ? `-${fmtCompact(p.lostUnitsCurrentOos)} u` : `${p.daysOfCover}d`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No active stockout or critical runway alerts in this filter.
            </p>
          )}
        </div>
      </div>

      {/* ── Main Current Stock & 3-Month Trajectory Catalogue (Table / Cards) ── */}
      <div className="card-glass flex flex-col gap-3 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="eyebrow">
              Product Stock Catalogue · {filtered.length} of {products.length} Products
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Click any product to slide open its interactive daily stock trajectory, 3-month
              forecast graph, and out-of-stock loss breakdown.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU, name, brand…"
                className="h-8 w-48 rounded-lg border border-border bg-card pr-2.5 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:w-56"
              />
            </div>

            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
              className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Health filter */}
            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value as StockHealth | 'all')}
              aria-label="Filter by stock health"
              className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Health Tiers</option>
              <option value="out_of_stock">Out of Stock (0)</option>
              <option value="critical">Critical (&lt; 30d)</option>
              <option value="warning">Reorder (30–90d)</option>
              <option value="healthy">Healthy (90d+)</option>
            </select>

            {/* Sort */}
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2">
              <ArrowUpDown className="size-3.5 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                aria-label="Sort products"
                className="h-8 bg-transparent text-xs text-foreground focus:outline-none"
              >
                <option value="velocity_desc">Fastest Selling First</option>
                <option value="stock_desc">Highest Stock First</option>
                <option value="stock_asc">Lowest Stock First</option>
                <option value="cover_asc">Shortest Runway First</option>
                <option value="loss_desc">Highest Stockout Loss First</option>
                <option value="name_asc">Name (A → Z)</option>
              </select>
            </div>

            {/* View toggle: Table | Cards */}
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  viewMode === 'table'
                    ? 'bg-muted text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <List className="size-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  viewMode === 'cards'
                    ? 'bg-muted text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="size-3.5" />
                Cards
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'cards' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((p) => {
              const health = HEALTH_META[p.health];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProduct(p.id)}
                  className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/80 bg-card/60 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                          {p.sku}
                        </span>
                        <span
                          className={cn(
                            'rounded-full border px-1.5 py-px text-[9px] font-medium',
                            STATUS_BADGE[p.status],
                          )}
                        >
                          {p.status}
                        </span>
                      </div>
                      <h3 className="mt-1 line-clamp-2 text-xs font-semibold text-foreground">
                        {p.shortName}
                      </h3>
                    </div>

                    <span
                      className={cn(
                        'shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums',
                        health.badgeClass,
                      )}
                    >
                      {p.isOutOfStock
                        ? 'OOS'
                        : p.daysOfCover === null
                          ? '90d+'
                          : `${p.daysOfCover}d`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/25 px-2.5 py-2">
                    <MiniStockSparkline product={p} width={155} height={38} />
                    <div className="flex flex-col items-end font-mono tabular-nums">
                      <span className="text-sm font-bold text-foreground">
                        {fmtCompact(p.currentStock)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {fmtVelocity(p.dailyVelocity)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11px] tabular-nums">
                    <span className="text-muted-foreground">
                      +90d:{' '}
                      <strong
                        className={
                          p.reorderNeeded90d > 0
                            ? 'font-mono text-amber-400'
                            : 'font-mono text-emerald-400'
                        }
                      >
                        {p.reorderNeeded90d > 0
                          ? `Need +${fmtCompact(p.reorderNeeded90d)}`
                          : `${fmtCompact(p.stockAt90d)} left`}
                      </strong>
                    </span>

                    {p.isOutOfStock && p.lostUnitsCurrentOos > 0 ? (
                      <span className="font-mono font-semibold text-rose-400">
                        Lost: {fmtCompact(p.lostUnitsCurrentOos)} u ({p.currentOosDays}d)
                      </span>
                    ) : p.projectedRunoutDate && p.daysOfCover !== null && p.daysOfCover < 90 ? (
                      <span className="text-amber-400">
                        Out {fmtShortDate(p.projectedRunoutDate)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Graph →</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[240px]">Product</TableHead>
                  <TableHead className="text-right">Dankuni</TableHead>
                  <TableHead className="text-right">Chennai</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead className="w-[140px]">30d Trend + 3M</TableHead>
                  <TableHead className="text-right">Daily Velocity</TableHead>
                  <TableHead className="text-right">Runway / Cover</TableHead>
                  <TableHead className="text-right">3M (90d) Projection</TableHead>
                  <TableHead className="text-right">OOS Stock Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const health = HEALTH_META[p.health];
                  return (
                    <TableRow
                      key={p.id}
                      onClick={() => onSelectProduct(p.id)}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                    >
                      <TableCell className="py-2.5 whitespace-normal">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                              {p.sku}
                            </span>
                            <span
                              className={cn(
                                'rounded-full border px-1.5 py-px text-[10px] font-medium',
                                STATUS_BADGE[p.status],
                              )}
                            >
                              {p.status}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {p.brand} · {p.category}
                            </span>
                          </div>
                          <span className="font-medium text-foreground">{p.shortName}</span>
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {fmtUnits(p.dankuniStock)}
                        {p.oldLogoStock > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            +{fmtUnits(p.oldLogoStock)} old
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {p.chennaiStock > 0 ? (
                          <span className="inline-flex items-center justify-end gap-1 font-semibold text-sky-400">
                            <ChennaiCheckBadge product={p} />
                            {fmtUnits(p.chennaiStock)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {(p.chennaiCheck === 'mismatch' || p.chennaiCheck === 'current-only') && (
                          <div className="text-[10px] font-normal text-amber-400/80">
                            Col G: {fmtUnits(p.chennaiStockSheetG)}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-mono text-sm font-bold text-foreground tabular-nums">
                        {fmtUnits(p.currentStock)}
                        {p.packagingCount > 0 && (
                          <div className="text-[10px] font-normal text-muted-foreground">
                            {fmtCompact(p.packagingCount)} boxes
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        <MiniStockSparkline product={p} />
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        <div className="font-semibold text-foreground">
                          {fmtVelocity(p.dailyVelocity)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Sold: {fmtCompact(p.totalSold)}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums',
                            health.badgeClass,
                          )}
                        >
                          {p.isOutOfStock
                            ? '0d (OOS)'
                            : p.daysOfCover === null
                              ? '90d+ (No burn)'
                              : `${p.daysOfCover}d`}
                        </span>
                        {p.projectedRunoutDate && !p.isOutOfStock && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            Out {fmtShortDate(p.projectedRunoutDate)}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {p.reorderNeeded90d > 0 ? (
                          <div>
                            <span className="font-semibold text-amber-400">
                              Need +{fmtUnits(p.reorderNeeded90d)}
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              90d demand: {fmtCompact(p.demand90d)}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="font-semibold text-emerald-400">
                              {fmtUnits(p.stockAt90d)} left
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              90d demand: {fmtCompact(p.demand90d)}
                            </div>
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {p.isOutOfStock && p.lostUnitsCurrentOos > 0 ? (
                          <div>
                            <span className="font-bold text-rose-400">
                              -{fmtUnits(p.lostUnitsCurrentOos)} u
                            </span>
                            <div className="text-[10px] text-rose-300/80">
                              {p.currentOosDays}d unavailable
                            </div>
                          </div>
                        ) : p.projectedStockLoss90d > 0 ? (
                          <div>
                            <span className="text-amber-400">
                              Est. -{fmtCompact(p.projectedStockLoss90d)} u
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              in next {p.projectedOosDays90d}d OOS
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No products match your current filter criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

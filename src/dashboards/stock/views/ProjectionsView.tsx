import {
  AlertTriangle,
  Box,
  CalendarClock,
  CheckCircle2,
  PackagePlus,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  fmtCompact,
  fmtShortDate,
  fmtUnits,
  fmtVelocity,
  HEALTH_META,
  STATUS_BADGE,
} from '@/dashboards/stock/data/format';
import type { ProductStockAnalytics } from '@/dashboards/stock/data/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { cn } from '@/shared/lib/utils';

type ProjectionFilter = 'all' | 'needs_reorder' | 'critical_30d' | 'pkg_shortfall';

export default function ProjectionsView({
  products,
  onSelectProduct,
}: {
  products: ProductStockAnalytics[];
  onSelectProduct: (id: string) => void;
}) {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<ProjectionFilter>(() => {
    const m = searchParams.get('mode');
    return m === 'needs_reorder' || m === 'critical_30d' || m === 'pkg_shortfall' ? m : 'all';
  });

  const stats = useMemo(() => {
    const totalCurrent = products.reduce((s, p) => s + p.currentStock, 0);
    const total30dStock = products.reduce((s, p) => s + p.stockAt30d, 0);
    const total60dStock = products.reduce((s, p) => s + p.stockAt60d, 0);
    const total90dStock = products.reduce((s, p) => s + p.stockAt90d, 0);
    const total90dDemand = products.reduce((s, p) => s + p.demand90d, 0);
    const totalReorder = products.reduce((s, p) => s + p.reorderNeeded90d, 0);
    const needsReorderCount = products.filter((p) => p.reorderNeeded90d > 0).length;
    const critical30dCount = products.filter(
      (p) => p.daysOfCover !== null && p.daysOfCover < 30 && p.dailyVelocity > 0,
    ).length;
    const pkgShortfallCount = products.filter((p) => p.packagingShortfall90d > 0).length;
    return {
      totalCurrent,
      total30dStock,
      total60dStock,
      total90dStock,
      total90dDemand,
      totalReorder,
      needsReorderCount,
      critical30dCount,
      pkgShortfallCount,
    };
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (mode === 'needs_reorder' && p.reorderNeeded90d <= 0) return false;
        if (
          mode === 'critical_30d' &&
          !(p.daysOfCover !== null && p.daysOfCover < 30 && p.dailyVelocity > 0)
        ) {
          return false;
        }
        if (mode === 'pkg_shortfall' && p.packagingShortfall90d <= 0) return false;
        if (
          q &&
          !p.name.toLowerCase().includes(q) &&
          !p.sku.toLowerCase().includes(q) &&
          !p.category.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by reorderNeeded90d desc, then shortest runway first
        if (b.reorderNeeded90d !== a.reorderNeeded90d) {
          return b.reorderNeeded90d - a.reorderNeeded90d;
        }
        const ca = a.daysOfCover ?? 999999;
        const cb = b.daysOfCover ?? 999999;
        return ca - cb || b.dailyVelocity - a.dailyVelocity;
      });
  }, [products, search, mode]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* ── 3-Month Horizon Summary Strip ── */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <div className="card-glass rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Today’s Stock</span>
            <Box className="size-4 text-emerald-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-foreground tabular-nums">
            {fmtUnits(stats.totalCurrent)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Across {products.length} tracked SKUs
          </div>
        </div>

        <div className="card-glass rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">+30d Projected</span>
            <CalendarClock className="size-4 text-sky-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-foreground tabular-nums">
            {fmtUnits(stats.total30dStock)}
          </div>
          <div className="mt-0.5 text-[11px] text-amber-400">
            {stats.critical30dCount} SKUs deplete within 30d
          </div>
        </div>

        <div className="card-glass rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">+60d Projected</span>
            <CalendarClock className="size-4 text-amber-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-foreground tabular-nums">
            {fmtUnits(stats.total60dStock)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            After 2 months of projected burn
          </div>
        </div>

        <div className="card-glass rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">+90d Projected</span>
            <CalendarClock className="size-4 text-purple-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-foreground tabular-nums">
            {fmtUnits(stats.total90dStock)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            3M Total Demand: <strong>{fmtCompact(stats.total90dDemand)}</strong> u
          </div>
        </div>

        <div className="card-glass rounded-xl border-amber-500/30 bg-amber-500/5 p-3.5">
          <div className="flex items-center justify-between text-xs text-amber-300">
            <span className="font-medium uppercase tracking-wider">3M Reorder Needed</span>
            <PackagePlus className="size-4 text-amber-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-amber-400 tabular-nums">
            +{fmtUnits(stats.totalReorder)}
          </div>
          <div className="mt-0.5 text-[11px] text-amber-300/80">
            Across {stats.needsReorderCount} SKUs needing restock
          </div>
        </div>
      </div>

      {/* ── 3-Month Replenishment Table ── */}
      <div className="card-glass flex flex-col gap-3 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="eyebrow">
              3-Month (90-Day) Stock Projection & Replenishment Schedule ({filtered.length})
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ranked by 90-day restock requirement. Shows projected stock at +30d, +60d, and +90d,
              exact run-out date, and whether packaging boxes are available.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
              {(
                [
                  ['all', `All (${products.length})`],
                  ['needs_reorder', `Needs 3M Restock (${stats.needsReorderCount})`],
                  ['critical_30d', `< 30d Runway (${stats.critical30dCount})`],
                  ['pkg_shortfall', `Packaging Shortfall (${stats.pkgShortfallCount})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    mode === id
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU or product…"
                className="h-8 w-52 rounded-lg border border-border bg-card pr-2.5 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[230px]">Product</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Daily Velocity</TableHead>
                <TableHead className="text-right">Runway & Run-out</TableHead>
                <TableHead className="text-right">+30d Stock</TableHead>
                <TableHead className="text-right">+60d Stock</TableHead>
                <TableHead className="text-right">+90d Stock</TableHead>
                <TableHead className="text-right">90d Demand</TableHead>
                <TableHead className="text-right">3M Restock Req.</TableHead>
                <TableHead className="text-right">Packaging Boxes</TableHead>
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
                        <div className="flex items-center gap-1.5">
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
                        </div>
                        <span className="font-medium text-foreground">{p.shortName}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm font-bold text-foreground tabular-nums">
                      {fmtUnits(p.currentStock)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {fmtVelocity(p.dailyVelocity)}
                    </TableCell>

                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'inline-flex rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums',
                          health.badgeClass,
                        )}
                      >
                        {p.isOutOfStock
                          ? '0d (OOS)'
                          : p.daysOfCover === null
                            ? '90d+'
                            : `${p.daysOfCover}d`}
                      </span>
                      {p.projectedRunoutDate && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {p.isOutOfStock
                            ? 'Depleted'
                            : `Out ${fmtShortDate(p.projectedRunoutDate, true)}`}
                        </div>
                      )}
                    </TableCell>

                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs tabular-nums',
                        p.stockAt30d === 0 ? 'font-semibold text-rose-400' : 'text-foreground',
                      )}
                    >
                      {fmtUnits(p.stockAt30d)}
                    </TableCell>

                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs tabular-nums',
                        p.stockAt60d === 0 ? 'font-semibold text-rose-400' : 'text-foreground',
                      )}
                    >
                      {fmtUnits(p.stockAt60d)}
                    </TableCell>

                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs tabular-nums',
                        p.stockAt90d === 0 ? 'font-semibold text-rose-400' : 'text-emerald-400',
                      )}
                    >
                      {fmtUnits(p.stockAt90d)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {fmtUnits(p.demand90d)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {p.reorderNeeded90d > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 font-bold text-amber-400">
                          +{fmtUnits(p.reorderNeeded90d)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="size-3.5" /> Covered
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {p.packagingCount > 0 ? (
                        <div>
                          <span className="text-foreground">{fmtUnits(p.packagingCount)}</span>
                          {p.packagingShortfall90d > 0 && (
                            <div className="flex items-center justify-end gap-1 text-[10px] text-rose-400">
                              <AlertTriangle className="size-3" />
                              Short {fmtCompact(p.packagingShortfall90d)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                    No products match this projection filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

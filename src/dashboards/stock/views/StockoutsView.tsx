import {
  AlertOctagon,
  CalendarX2,
  Clock,
  PackageX,
  Search,
  TrendingDown,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  fmtCompact,
  fmtShortDate,
  fmtUnits,
  fmtVelocity,
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

type OosScope = 'unavailable_now' | 'historical_oos' | 'projected_90d_oos';

export default function StockoutsView({
  products,
  onSelectProduct,
}: {
  products: ProductStockAnalytics[];
  onSelectProduct: (id: string) => void;
}) {
  const [searchParams] = useSearchParams();
  const [scope, setScope] = useState<OosScope>(() => {
    const s = searchParams.get('scope');
    return s === 'historical_oos' || s === 'projected_90d_oos' ? s : 'unavailable_now';
  });
  const [search, setSearch] = useState('');

  const summary = useMemo(() => {
    const unavailableNow = products.filter((p) => p.isOutOfStock);
    const activeUnavailableNow = unavailableNow.filter(
      (p) => p.preOosVelocity > 0 || p.totalSold > 0,
    );
    const historicalOos = products.filter(
      (p) => p.totalHistoricalOosDays > 0 && (p.preOosVelocity > 0 || p.totalSold > 0),
    );
    const projected90dOos = products.filter(
      (p) => !p.isOutOfStock && p.projectedOosDays90d > 0 && p.projectedStockLoss90d > 0,
    );

    const totalCurrentOosDays = activeUnavailableNow.reduce((s, p) => s + p.currentOosDays, 0);
    const totalCurrentLostUnits = unavailableNow.reduce((s, p) => s + p.lostUnitsCurrentOos, 0);
    const totalHistLostUnits = products.reduce((s, p) => s + p.lostUnitsHistoricalTotal, 0);
    const totalProj90dLostUnits = products.reduce((s, p) => s + p.projectedStockLoss90d, 0);

    return {
      unavailableNow,
      activeUnavailableNow,
      historicalOos,
      projected90dOos,
      totalCurrentOosDays,
      totalCurrentLostUnits,
      totalHistLostUnits,
      totalProj90dLostUnits,
    };
  }, [products]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base =
      scope === 'unavailable_now'
        ? summary.unavailableNow
        : scope === 'historical_oos'
          ? summary.historicalOos
          : summary.projected90dOos;

    return base
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (scope === 'projected_90d_oos') {
          return b.projectedStockLoss90d - a.projectedStockLoss90d;
        }
        if (scope === 'historical_oos') {
          return (
            b.lostUnitsHistoricalTotal - a.lostUnitsHistoricalTotal ||
            b.totalHistoricalOosDays - a.totalHistoricalOosDays
          );
        }
        return (
          b.lostUnitsCurrentOos - a.lostUnitsCurrentOos ||
          b.preOosVelocity - a.preOosVelocity ||
          b.currentOosDays - a.currentOosDays
        );
      });
  }, [summary, scope, search]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* ── Stockout Loss Summary KPI Strip ── */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="card-glass rounded-xl border-rose-500/35 bg-rose-500/8 p-3.5">
          <div className="flex items-center justify-between text-xs text-rose-300">
            <span className="font-medium uppercase tracking-wider">Currently Unavailable</span>
            <PackageX className="size-4 text-rose-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-rose-400 tabular-nums">
            {summary.unavailableNow.length}
            <span className="text-sm font-normal text-rose-300/80"> SKUs</span>
          </div>
          <div className="mt-0.5 text-[11px] text-rose-300/80">
            {summary.activeUnavailableNow.length} had active sales before hitting 0
          </div>
        </div>

        <div className="card-glass rounded-xl border-rose-500/35 bg-rose-500/8 p-3.5">
          <div className="flex items-center justify-between text-xs text-rose-300">
            <span className="font-medium uppercase tracking-wider">
              Stock Loss (Current OOS)
            </span>
            <AlertOctagon className="size-4 text-rose-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-rose-400 tabular-nums">
            {fmtUnits(summary.totalCurrentLostUnits)}
            <span className="text-sm font-normal text-rose-300/80"> units</span>
          </div>
          <div className="mt-0.5 text-[11px] text-rose-300/80">
            Across {summary.totalCurrentOosDays} cumulative unavailable SKU-days
          </div>
        </div>

        <div className="card-glass rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">
              All-Time Historical OOS Loss
            </span>
            <CalendarX2 className="size-4 text-amber-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-foreground tabular-nums">
            {fmtUnits(summary.totalHistLostUnits)}
            <span className="text-sm font-normal text-muted-foreground"> units</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Estimated sales missed during all OOS windows
          </div>
        </div>

        <div className="card-glass rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">
              Projected 90d Stock Loss
            </span>
            <TrendingDown className="size-4 text-amber-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-amber-400 tabular-nums">
            {fmtUnits(summary.totalProj90dLostUnits)}
            <span className="text-sm font-normal text-muted-foreground"> units</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            If {summary.projected90dOos.length} at-risk + OOS SKUs are not restocked
          </div>
        </div>
      </div>

      {/* ── Methodology Note ── */}
      <div className="rounded-xl border border-border/70 bg-card/50 px-4 py-2.5 text-xs text-muted-foreground">
        <strong className="text-foreground">How Stock Loss During Unavailable Days is Calculated:</strong>{' '}
        For each product that reaches <code className="text-foreground">0</code> stock, we measure
        its <strong className="text-foreground">Pre-Stockout Daily Velocity</strong> (average daily
        units dispatched during active in-stock days prior to running out) and multiply by the
        number of <strong className="text-foreground">Unavailable Days</strong> (
        <code className="text-foreground">Stock Loss = OOS Days × Pre-OOS Daily Velocity</code>).
      </div>

      {/* ── Stockout Loss Table ── */}
      <div className="card-glass flex flex-col gap-3 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
            {(
              [
                [
                  'unavailable_now',
                  `Currently Unavailable (${summary.unavailableNow.length})`,
                ],
                [
                  'historical_oos',
                  `All Historical Stockouts (${summary.historicalOos.length})`,
                ],
                [
                  'projected_90d_oos',
                  `In-Stock But Will Stock Out in <90d (${summary.projected90dOos.length})`,
                ],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScope(id)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  scope === id
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
              placeholder="Search unavailable SKU…"
              className="h-8 w-56 rounded-lg border border-border bg-card pr-2.5 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[230px]">Product</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">
                  {scope === 'projected_90d_oos' ? 'Projected Run-out' : 'Unavailable Since'}
                </TableHead>
                <TableHead className="text-right">
                  {scope === 'projected_90d_oos'
                    ? 'OOS Days in Next 90d'
                    : 'Unavailable Days'}
                </TableHead>
                <TableHead className="text-right">Pre-OOS Velocity</TableHead>
                <TableHead className="text-right">
                  {scope === 'projected_90d_oos'
                    ? 'Projected 90d Stock Loss'
                    : 'Stock Loss (During OOS Days)'}
                </TableHead>
                <TableHead className="text-right">Next 90d Additional Loss</TableHead>
                <TableHead>Top Impacted Channels</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const topCh = p.channels.slice(0, 3);
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
                          <span className="text-[10px] text-muted-foreground">
                            {p.brand} · {p.category}
                          </span>
                        </div>
                        <span className="font-medium text-foreground">{p.shortName}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm font-bold tabular-nums">
                      <span className={p.isOutOfStock ? 'text-rose-400' : 'text-foreground'}>
                        {fmtUnits(p.currentStock)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {scope === 'projected_90d_oos' ? (
                        <div>
                          <span className="font-semibold text-amber-400">
                            {fmtShortDate(p.projectedRunoutDate, true)}
                          </span>
                          <div className="text-[10px] text-muted-foreground">
                            in {p.daysOfCover} days
                          </div>
                        </div>
                      ) : p.oosSinceDate ? (
                        <div>
                          <span className="text-foreground">
                            {fmtShortDate(p.oosSinceDate, true)}
                          </span>
                          {p.lastSaleDate && (
                            <div className="text-[10px] text-muted-foreground">
                              Last sale: {fmtShortDate(p.lastSaleDate)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No prior stock</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {scope === 'projected_90d_oos' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-400">
                          <Clock className="size-3" />
                          {p.projectedOosDays90d} days
                        </span>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-400">
                            <Clock className="size-3" />
                            {scope === 'historical_oos'
                              ? `${p.totalHistoricalOosDays}d total`
                              : `${p.currentOosDays} days`}
                          </span>
                          {scope === 'unavailable_now' &&
                            p.totalHistoricalOosDays > p.currentOosDays && (
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {p.totalHistoricalOosDays}d all-time
                              </div>
                            )}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      <span className="font-semibold text-foreground">
                        {fmtVelocity(p.preOosVelocity)}
                      </span>
                      <div className="text-[10px] text-muted-foreground">
                        Sold: {fmtCompact(p.totalSold)} u
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm font-bold tabular-nums">
                      {scope === 'projected_90d_oos' ? (
                        <span className="text-amber-400">
                          -{fmtUnits(p.projectedStockLoss90d)} units
                        </span>
                      ) : (
                        <span className="text-rose-400">
                          -
                          {fmtUnits(
                            scope === 'historical_oos'
                              ? p.lostUnitsHistoricalTotal
                              : p.lostUnitsCurrentOos,
                          )}{' '}
                          units
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {p.projectedStockLoss90d > 0 ? (
                        <span className="text-amber-400">
                          -{fmtUnits(p.projectedStockLoss90d)} u
                        </span>
                      ) : (
                        '0'
                      )}
                    </TableCell>

                    <TableCell className="whitespace-normal">
                      {topCh.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {topCh.map((c) => (
                            <span
                              key={c.channel}
                              className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {c.channel}: <strong className="text-foreground">{fmtCompact(c.units)}</strong>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No unavailable products match this filter.
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

import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  PackageX,
  TrendingDown,
  Warehouse,
} from 'lucide-react';
import { useState } from 'react';

import { ChennaiCheckBadge } from '@/dashboards/stock/components/ChennaiCheckBadge';
import { StockTrajectoryChart } from '@/dashboards/stock/components/StockTrajectoryChart';
import { chennaiCheckTitle } from '@/dashboards/stock/data/chennaiCheck';
import {
  fmtCompact,
  fmtShortDate,
  fmtUnits,
  fmtVelocity,
  HEALTH_META,
  STATUS_BADGE,
} from '@/dashboards/stock/data/format';
import type { ProductStockAnalytics } from '@/dashboards/stock/data/types';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { cn } from '@/shared/lib/utils';

/**
 * Keeps the last non-null product rendered while the right-side sheet animates out
 * from left to right on close.
 */
function useSticky<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value != null && value !== last) setLast(value);
  return value ?? last;
}

export function ProductStockModal({
  product,
  list,
  onSelect,
  onClose,
}: {
  product: ProductStockAnalytics | null;
  list: ProductStockAnalytics[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const shown = useSticky(product);

  const idx = shown ? list.findIndex((p) => p.id === shown.id) : -1;
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  return (
    <Dialog open={product != null} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        side="right"
        className="sm:max-w-5xl"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' && prev) onSelect(prev.id);
          if (e.key === 'ArrowRight' && next) onSelect(next.id);
        }}
      >
        <DialogHeader className="flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {shown && (
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border/80 bg-muted/70 px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                  {shown.sku}
                </span>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                    STATUS_BADGE[shown.status],
                  )}
                >
                  {shown.status}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                    HEALTH_META[shown.health].badgeClass,
                  )}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: HEALTH_META[shown.health].dotColor }}
                  />
                  {HEALTH_META[shown.health].label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {shown.brand} · {shown.category}
                  {shown.material ? ` · ${shown.material}` : ''}
                </span>
              </div>
            )}
            <DialogTitle className="text-lg leading-snug">{shown?.name}</DialogTitle>
            {shown && (
              <DialogDescription className="mt-0.5">
                Historical daily stock curve (Apr–Nov 2026), 90-day projection runway, and
                out-of-stock unit loss
              </DialogDescription>
            )}
          </div>

          {idx >= 0 && (
            <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border/80 bg-muted/35 p-1">
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={!prev}
                onClick={() => prev && onSelect(prev.id)}
                title="Previous product (←)"
                aria-label="Previous product"
              >
                <ChevronLeft />
              </Button>
              <span className="px-2 font-mono text-xs font-medium text-muted-foreground tabular-nums">
                {idx + 1} <span className="opacity-50">/</span> {list.length}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={!next}
                onClick={() => next && onSelect(next.id)}
                title="Next product (→)"
                aria-label="Next product"
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </DialogHeader>

        <DialogBody>
          {shown && (
            <div className="flex flex-col gap-4">
              {/* ── 6 KPI Summary Cards ── */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card/60 p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Current Stock</span>
                    <Boxes className="size-3.5 text-emerald-400" />
                  </div>
                  <div className="mt-1.5 font-mono text-xl font-bold text-foreground tabular-nums">
                    {fmtUnits(shown.currentStock)}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground tabular-nums">
                    DK: {fmtCompact(shown.dankuniStock)} · CH: {fmtCompact(shown.chennaiStock)}
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card/60 p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Daily Run Rate</span>
                    <TrendingDown className="size-3.5 text-sky-400" />
                  </div>
                  <div className="mt-1.5 font-mono text-xl font-bold text-foreground tabular-nums">
                    {fmtVelocity(shown.dailyVelocity)}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground tabular-nums">
                    Total Sold: {fmtCompact(shown.totalSold)} u
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card/60 p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Days of Cover</span>
                    <CalendarClock className="size-3.5 text-amber-400" />
                  </div>
                  <div className="mt-1.5 font-mono text-xl font-bold text-foreground tabular-nums">
                    {shown.daysOfCover === null ? '90d+' : `${fmtUnits(shown.daysOfCover)}d`}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">
                    {shown.isOutOfStock
                      ? 'Depleted (0 stock)'
                      : shown.projectedRunoutDate
                        ? `Out ${fmtShortDate(shown.projectedRunoutDate, true)}`
                        : 'No active burn'}
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card/60 p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>3-Month Demand</span>
                    <PackageCheck className="size-3.5 text-purple-400" />
                  </div>
                  <div className="mt-1.5 font-mono text-xl font-bold text-foreground tabular-nums">
                    {fmtUnits(shown.demand90d)}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground tabular-nums">
                    30d: {fmtCompact(shown.demand30d)} · 60d: {fmtCompact(shown.demand60d)}
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card/60 p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>3M Restock Req.</span>
                    <AlertTriangle className="size-3.5 text-amber-400" />
                  </div>
                  <div
                    className={cn(
                      'mt-1.5 font-mono text-xl font-bold tabular-nums',
                      shown.reorderNeeded90d > 0 ? 'text-amber-400' : 'text-emerald-400',
                    )}
                  >
                    {shown.reorderNeeded90d > 0
                      ? `+${fmtCompact(shown.reorderNeeded90d)}`
                      : 'Covered'}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground tabular-nums">
                    Pkg Boxes: {fmtUnits(shown.packagingCount)}
                  </div>
                </div>

                <div
                  className={cn(
                    'flex flex-col justify-between rounded-xl border p-3.5 shadow-2xs',
                    shown.isOutOfStock || shown.projectedStockLoss90d > 0
                      ? 'border-rose-500/35 bg-rose-500/8'
                      : 'border-border/80 bg-card/60',
                  )}
                >
                  <div className="flex items-center justify-between text-[11px] font-medium text-rose-300">
                    <span>{shown.isOutOfStock ? 'OOS Stock Loss' : 'Proj. 3M Loss'}</span>
                    <PackageX className="size-3.5 text-rose-400" />
                  </div>
                  <div
                    className={cn(
                      'mt-1.5 font-mono text-xl font-bold tabular-nums',
                      shown.isOutOfStock || shown.projectedStockLoss90d > 0
                        ? 'text-rose-400'
                        : 'text-emerald-400',
                    )}
                  >
                    {shown.isOutOfStock
                      ? `${fmtCompact(shown.lostUnitsCurrentOos)} u`
                      : shown.projectedStockLoss90d > 0
                        ? `${fmtCompact(shown.projectedStockLoss90d)} u`
                        : '0 u'}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-rose-300/80">
                    {shown.isOutOfStock
                      ? `${shown.currentOosDays}d OOS (since ${fmtShortDate(shown.oosSinceDate)})`
                      : shown.projectedOosDays90d > 0
                        ? `${shown.projectedOosDays90d}d OOS in next 90d`
                        : 'Zero OOS days in 90d'}
                  </div>
                </div>
              </div>

              {/* ── Main Stock Trajectory & 3-Month Forecast Chart Card ── */}
              <div className="rounded-2xl border border-border/80 bg-card/50 p-4 shadow-xs">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Daily Stock Trajectory & 3-Month (90-Day) Forecast
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Hover anywhere on the curve to inspect daily stock, inflows & projected loss
                  </span>
                </div>
                <StockTrajectoryChart product={shown} historyDays={120} height={260} />
              </div>

              {/* ── Bottom 2 Columns: 3-Month Milestones + Warehouse/Channel Split ── */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Left: 30d / 60d / 90d Forecast Milestones & Ledger */}
                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border/80 bg-card/50 p-4">
                  <div>
                    <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      3-Month Projection Horizons & Stockout Impact
                    </h3>
                    <div className="flex flex-col gap-2 text-xs">
                      {[
                        {
                          horizon: '+30 Days (1 Month)',
                          demand: shown.demand30d,
                          remaining: shown.stockAt30d,
                          shortfall: Math.max(
                            0,
                            shown.demand30d - (shown.currentStock + shown.upcomingStock),
                          ),
                        },
                        {
                          horizon: '+60 Days (2 Months)',
                          demand: shown.demand60d,
                          remaining: shown.stockAt60d,
                          shortfall: Math.max(
                            0,
                            shown.demand60d - (shown.currentStock + shown.upcomingStock),
                          ),
                        },
                        {
                          horizon: '+90 Days (3 Months)',
                          demand: shown.demand90d,
                          remaining: shown.stockAt90d,
                          shortfall: shown.reorderNeeded90d,
                        },
                      ].map((row) => (
                        <div
                          key={row.horizon}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/60 px-3.5 py-2.5"
                        >
                          <span className="font-medium text-foreground">{row.horizon}</span>
                          <div className="flex items-center gap-3 font-mono tabular-nums">
                            <span className="text-muted-foreground">
                              Demand:{' '}
                              <strong className="text-foreground">{fmtUnits(row.demand)}</strong>
                            </span>
                            <span
                              className={cn(
                                'rounded-md px-2 py-0.5 text-[11px] font-semibold',
                                row.remaining > 0
                                  ? 'bg-emerald-500/12 text-emerald-400'
                                  : 'bg-rose-500/12 text-rose-400',
                              )}
                            >
                              Stock: {fmtUnits(row.remaining)}
                            </span>
                            {row.shortfall > 0 && (
                              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                                Loss: -{fmtUnits(row.shortfall)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inventory Balance Ledger */}
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-background/40 p-3 text-[11px] sm:grid-cols-4">
                    <div>
                      <div className="text-muted-foreground">Opening (Apr 1)</div>
                      <div className="mt-0.5 font-mono text-xs font-semibold text-foreground tabular-nums">
                        {fmtUnits(shown.openStock)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Received</div>
                      <div className="mt-0.5 font-mono text-xs font-semibold text-sky-400 tabular-nums">
                        +{fmtUnits(shown.totalReceived)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Dispatched</div>
                      <div className="mt-0.5 font-mono text-xs font-semibold text-amber-400 tabular-nums">
                        -{fmtUnits(shown.totalSold)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">All-Time OOS Loss</div>
                      <div className="mt-0.5 font-mono text-xs font-semibold text-rose-400 tabular-nums">
                        {fmtUnits(shown.lostUnitsHistoricalTotal)} u ({shown.totalHistoricalOosDays}d)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Warehouse Split + Outbound Channel Breakdown */}
                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border/80 bg-card/50 p-4">
                  {/* Warehouse & Packaging Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/50 px-3.5 py-2.5 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                      <Warehouse className="size-3.5 text-sky-400" />
                      Warehouses:
                    </span>
                    <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
                      <span>
                        Dankuni: <strong className="text-foreground">{fmtUnits(shown.dankuniStock)}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1" title={chennaiCheckTitle(shown)}>
                        Chennai:{' '}
                        <strong className="text-sky-400">{fmtUnits(shown.chennaiStock)}</strong>
                        <ChennaiCheckBadge product={shown} className="size-3.5" />
                        {(shown.chennaiCheck === 'mismatch' ||
                          shown.chennaiCheck === 'current-only') && (
                          <span className="text-[10px] text-amber-400">
                            (CURRENT tab {fmtUnits(shown.chennaiStockCurrentTab ?? 0)} · Col G{' '}
                            {fmtUnits(shown.chennaiStockSheetG)})
                          </span>
                        )}
                      </span>
                      {shown.oldLogoStock > 0 && (
                        <span>
                          Old Logo: <strong>{fmtUnits(shown.oldLogoStock)}</strong>
                        </span>
                      )}
                      {shown.packagingCount > 0 && (
                        <span className="text-muted-foreground">
                          Boxes: <strong className="text-foreground">{fmtUnits(shown.packagingCount)}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Top Channels */}
                  <div className="flex-1">
                    <div className="mb-2.5 flex items-center justify-between">
                      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        Outbound Channel Breakdown
                      </h3>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {fmtUnits(shown.totalSold)} total units
                      </span>
                    </div>

                    {shown.channels.length > 0 ? (
                      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
                        {shown.channels.slice(0, 8).map((ch, i) => (
                          <div key={ch.channel} className="flex flex-col gap-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 truncate font-medium text-foreground">
                                <span className="w-4 font-mono text-[10px] text-muted-foreground">
                                  #{i + 1}
                                </span>
                                {ch.channel}
                              </span>
                              <span className="font-mono text-muted-foreground tabular-nums">
                                <strong className="text-foreground">{fmtUnits(ch.units)}</strong> (
                                {Math.round(ch.share * 100)}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${Math.max(3, Math.round(ch.share * 100))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-8 text-center text-xs text-muted-foreground">
                        No channel sales recorded for this product in the selected warehouse scope.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

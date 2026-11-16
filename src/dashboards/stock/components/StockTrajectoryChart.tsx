import { useId, useMemo, useState } from 'react';

import { fmtCompact, fmtShortDate, fmtUnits } from '@/dashboards/stock/data/format';
import type { ProductStockAnalytics } from '@/dashboards/stock/data/types';
import { cn } from '@/shared/lib/utils';

export type HistoryRange = 60 | 120 | 240;

interface ChartPoint {
  date: string;
  kind: 'history' | 'forecast';
  stock: number;
  inflow: number;
  outflow: number;
  lostUnits: number;
}

/**
 * Interactive SVG chart rendering a product's historical stock movement alongside its
 * 3-month (90-day) projected stock runway and shaded out-of-stock loss zones.
 */
export function StockTrajectoryChart({
  product,
  historyDays = 90,
  height = 260,
  showControls = true,
}: {
  product: ProductStockAnalytics;
  historyDays?: number;
  height?: number;
  showControls?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const [range, setRange] = useState<number>(historyDays);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { points, todayIdx, restockIndices, runoutIdx, maxVal } = useMemo(() => {
    const histSlice = product.dailySeries.slice(-range);
    const pts: ChartPoint[] = histSlice.map((d) => ({
      date: d.date,
      kind: 'history',
      stock: d.stock,
      inflow: d.inflow,
      outflow: d.outflow,
      lostUnits:
        d.stock <= 0 && d.outflow === 0 && product.preOosVelocity > 0
          ? Math.round(product.preOosVelocity)
          : 0,
    }));

    const tIdx = Math.max(0, pts.length - 1);

    // Sample every 2nd day of 90d forecast (plus day 90 and exact runout day) to keep SVG crisp
    for (const p of product.projectedSeries) {
      pts.push({
        date: p.date,
        kind: 'forecast',
        stock: p.projectedStock,
        inflow: 0,
        outflow: Math.round(product.dailyVelocity),
        lostUnits: p.cumulativeLostUnits,
      });
    }

    const restocks: number[] = [];
    pts.forEach((p, idx) => {
      if (p.kind === 'history' && p.inflow > 0 && idx > 0) restocks.push(idx);
    });

    let rIdx: number | null = null;
    for (let i = tIdx; i < pts.length; i++) {
      if (pts[i].stock <= 0) {
        rIdx = i;
        break;
      }
    }

    const peak = Math.max(10, ...pts.map((p) => p.stock));
    return {
      points: pts,
      todayIdx: tIdx,
      restockIndices: restocks,
      runoutIdx: rIdx,
      maxVal: peak * 1.08,
    };
  }, [product, range]);

  const W = 820;
  const H = height;
  const PAD = { top: 20, right: 20, bottom: 28, left: 54 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const xAt = (i: number) =>
    points.length <= 1 ? PAD.left : PAD.left + (i / (points.length - 1)) * plotW;
  const yAt = (v: number) => PAD.top + plotH - (Math.max(0, v) / maxVal) * plotH;
  const baseY = PAD.top + plotH;

  // Historical path & area
  const histPoints = points.slice(0, todayIdx + 1);
  const histLine = histPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.stock).toFixed(1)}`)
    .join(' ');
  const histArea =
    histPoints.length > 1
      ? `${histLine} L${xAt(todayIdx).toFixed(1)},${baseY.toFixed(1)} L${xAt(0).toFixed(1)},${baseY.toFixed(1)} Z`
      : '';

  // Forecast path & area (starts at todayIdx)
  const forecastPoints = points.slice(todayIdx);
  const forecastLine = forecastPoints
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${xAt(todayIdx + i).toFixed(1)},${yAt(p.stock).toFixed(1)}`,
    )
    .join(' ');
  const forecastArea =
    forecastPoints.length > 1
      ? `${forecastLine} L${xAt(points.length - 1).toFixed(1)},${baseY.toFixed(1)} L${xAt(todayIdx).toFixed(1)},${baseY.toFixed(1)} Z`
      : '';

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round((maxVal / 1.08) * t));

  const activeIdx = hoverIdx ?? todayIdx;
  const activePt = points[activeIdx] ?? points[todayIdx];

  return (
    <div className="flex flex-col gap-2">
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-4 rounded-sm bg-emerald-400" />
              Actual Stock
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-amber-400" />
              3-Month Projection (90d)
            </span>
            {restockIndices.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full bg-sky-400" />
                Stock Received
              </span>
            )}
            {(runoutIdx !== null || product.isOutOfStock) && (
              <span className="inline-flex items-center gap-1.5 text-rose-400">
                <span className="h-2 w-3 rounded-sm bg-rose-500/30 ring-1 ring-rose-500/50" />
                Unavailable / Stock Loss Zone
              </span>
            )}
          </div>

          <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
            {(
              [
                [60, '60d History'],
                [120, '120d History'],
                [240, 'Full (Apr–Nov)'],
              ] as const
            ).map(([days, label]) => (
              <button
                key={days}
                type="button"
                onClick={() => setRange(days)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                  range === days
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hover readout bar */}
      {activePt && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
                activePt.kind === 'history'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300',
              )}
            >
              {activePt.kind === 'history' ? 'Historical' : '3M Forecast'}
            </span>
            <span className="font-mono font-semibold text-foreground">
              {fmtShortDate(activePt.date, true)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 tabular-nums">
            <span>
              <span className="text-muted-foreground">Stock: </span>
              <span className="font-mono font-bold text-foreground">
                {fmtUnits(activePt.stock)}
              </span>
            </span>
            {activePt.kind === 'history' && activePt.inflow > 0 && (
              <span className="text-sky-400">
                Received: <strong className="font-mono">+{fmtUnits(activePt.inflow)}</strong>
              </span>
            )}
            {activePt.outflow > 0 && (
              <span className="text-amber-300">
                {activePt.kind === 'history' ? 'Dispatched: ' : 'Est. Burn: '}
                <strong className="font-mono">-{fmtUnits(activePt.outflow)}</strong>
              </span>
            )}
            {activePt.kind === 'forecast' && activePt.lostUnits > 0 && (
              <span className="text-rose-400">
                Cum. Stock Loss:{' '}
                <strong className="font-mono">{fmtUnits(activePt.lostUnits)} units</strong>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full select-none overflow-visible"
          style={{ height }}
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * W;
            const ratio = Math.max(0, Math.min(1, (relX - PAD.left) / plotW));
            const idx = Math.round(ratio * (points.length - 1));
            setHoverIdx(idx);
          }}
        >
          <defs>
            <linearGradient id={`hist-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`proj-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines & Y labels */}
          {yTicks.map((val, i) => {
            const y = yAt(val);
            return (
              <g key={i}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-border/50"
                  strokeDasharray={i === 0 ? undefined : '3 3'}
                />
                <text
                  x={PAD.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground font-mono text-[10px]"
                >
                  {fmtCompact(val)}
                </text>
              </g>
            );
          })}

          {/* Out-of-stock / Stockout loss shaded zone in forecast */}
          {runoutIdx !== null && runoutIdx < points.length - 1 && (
            <g>
              <rect
                x={xAt(runoutIdx)}
                y={PAD.top}
                width={Math.max(2, xAt(points.length - 1) - xAt(runoutIdx))}
                height={plotH}
                fill="#f43f5e"
                fillOpacity="0.11"
              />
              <line
                x1={xAt(runoutIdx)}
                x2={xAt(runoutIdx)}
                y1={PAD.top}
                y2={baseY}
                stroke="#f43f5e"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <text
                x={Math.min(W - PAD.right - 6, xAt(runoutIdx) + 6)}
                y={PAD.top + 14}
                textAnchor={xAt(runoutIdx) > W - 180 ? 'end' : 'start'}
                className="fill-rose-400 font-mono text-[10px] font-semibold"
              >
                {runoutIdx === todayIdx
                  ? `OOS Now · Est. 90d Loss: ${fmtUnits(product.projectedStockLoss90d)} u`
                  : `Stockout ${fmtShortDate(points[runoutIdx].date)} · Loss: ${fmtUnits(product.projectedStockLoss90d)} u`}
              </text>
            </g>
          )}

          {/* Historical area and line */}
          {histArea && <path d={histArea} fill={`url(#hist-grad-${uid})`} />}
          {histLine && (
            <path
              d={histLine}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Forecast area and dashed line */}
          {forecastArea && <path d={forecastArea} fill={`url(#proj-grad-${uid})`} />}
          {forecastLine && (
            <path
              d={forecastLine}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinejoin="round"
            />
          )}

          {/* Restock pins */}
          {restockIndices.map((idx) => (
            <g key={idx}>
              <circle
                cx={xAt(idx)}
                cy={yAt(points[idx].stock)}
                r="3.5"
                fill="#38bdf8"
                stroke="#090d16"
                strokeWidth="1.5"
              />
            </g>
          ))}

          {/* "Today" vertical divider */}
          <line
            x1={xAt(todayIdx)}
            x2={xAt(todayIdx)}
            y1={PAD.top}
            y2={baseY}
            stroke="currentColor"
            className="text-foreground/40"
            strokeDasharray="2 2"
          />
          <text
            x={xAt(todayIdx)}
            y={H - 8}
            textAnchor="middle"
            className="fill-foreground font-mono text-[10px] font-semibold"
          >
            Today ({fmtShortDate(points[todayIdx]?.date)})
          </text>

          {/* Start & End X-axis date labels */}
          {points.length > 0 && (
            <>
              <text
                x={PAD.left}
                y={H - 8}
                textAnchor="start"
                className="fill-muted-foreground font-mono text-[10px]"
              >
                {fmtShortDate(points[0].date, true)}
              </text>
              <text
                x={W - PAD.right}
                y={H - 8}
                textAnchor="end"
                className="fill-amber-400 font-mono text-[10px]"
              >
                +90d ({fmtShortDate(points[points.length - 1].date, true)})
              </text>
            </>
          )}

          {/* Active hover cursor + dot */}
          {activePt && (
            <g>
              <line
                x1={xAt(activeIdx)}
                x2={xAt(activeIdx)}
                y1={PAD.top}
                y2={baseY}
                stroke="currentColor"
                className="text-foreground/30"
              />
              <circle
                cx={xAt(activeIdx)}
                cy={yAt(activePt.stock)}
                r="4.5"
                fill={activePt.kind === 'history' ? '#10b981' : '#f59e0b'}
                stroke="#090d16"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

/**
 * Compact sparkline showing 30d historical stock (solid) + 30d/90d projection slope (dashed)
 * for inline table rows and overview cards.
 */
export function MiniStockSparkline({
  product,
  width = 128,
  height = 34,
}: {
  product: ProductStockAnalytics;
  width?: number;
  height?: number;
}) {
  const hist = product.sparkline30d;
  const proj = [
    product.currentStock,
    product.stockAt30d,
    product.stockAt60d,
    product.stockAt90d,
  ];
  const allVals = [...hist, ...proj];
  const max = Math.max(1, ...allVals);
  const min = 0;

  const splitX = Math.round(width * 0.62);
  const padY = 3;
  const plotH = height - padY * 2;

  const yAt = (v: number) => padY + plotH - ((Math.max(min, v) - min) / max) * plotH;

  const histPath = hist
    .map((v, i) => {
      const x = hist.length <= 1 ? 0 : (i / (hist.length - 1)) * splitX;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yAt(v).toFixed(1)}`;
    })
    .join(' ');

  const projPath = proj
    .map((v, i) => {
      const x = splitX + (i / (proj.length - 1)) * (width - splitX);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yAt(v).toFixed(1)}`;
    })
    .join(' ');

  const strokeColor =
    product.health === 'out_of_stock'
      ? '#f43f5e'
      : product.health === 'critical'
        ? '#f59e0b'
        : '#10b981';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-label={`Stock trend and 3-month projection for ${product.shortName}`}
    >
      <line
        x1={splitX}
        x2={splitX}
        y1={2}
        y2={height - 2}
        stroke="currentColor"
        className="text-border"
        strokeDasharray="2 2"
      />
      {histPath && (
        <path
          d={histPath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {projPath && (
        <path
          d={projPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeDasharray="3 2"
          strokeLinecap="round"
        />
      )}
      <circle
        cx={splitX}
        cy={yAt(product.currentStock)}
        r="2.3"
        fill={strokeColor}
      />
    </svg>
  );
}

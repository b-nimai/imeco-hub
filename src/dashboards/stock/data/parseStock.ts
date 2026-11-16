import { addDaysIso, diffDaysIso } from './parseDate';
import type {
  ChannelBreakdown,
  DailyStockPoint,
  ProductStatus,
  ProductStockAnalytics,
  ProjectionPoint,
  StockDashboardSummary,
  StockHealth,
  StockRawPayload,
  VelocityWindow,
  WarehouseScope,
} from './types';

const CHENNAI_SKUS = new Set(['IMEFTCNP600', 'IMEGHFT600', 'IMEGHTT']);

function normaliseStatus(raw: string): ProductStatus {
  const s = raw.trim().toLowerCase();
  if (s === 'bestseller') return 'Bestseller';
  if (s === 'recovered') return 'Recovered';
  if (s === 'discontinued') return 'Discontinued';
  return 'Active';
}

export function cleanProductName(raw: string): string {
  return raw
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^IMECO\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDateList(startIso: string, endIso: string): string[] {
  const count = diffDaysIso(startIso, endIso);
  if (count < 0) return [endIso];
  const out: string[] = [];
  for (let i = 0; i <= count; i++) {
    out.push(addDaysIso(startIso, i));
  }
  return out;
}

/**
 * Determine the effective "as of" date from the dataset (the latest date with recorded activity
 * up to today, defaulting to 2026-11-16).
 */
export function resolveAsOfDate(payload: StockRawPayload, todayOverride?: string): string {
  if (todayOverride) return todayOverride;
  const generatedIso = payload.generatedAt?.slice(0, 10);
  if (generatedIso && /^\d{4}-\d{2}-\d{2}$/.test(generatedIso)) {
    return generatedIso;
  }
  return '2026-11-16';
}

export function buildStockDashboardSummary(
  payload: StockRawPayload,
  options: {
    warehouse?: WarehouseScope;
    velocityWindow?: VelocityWindow;
    asOfDate?: string;
  } = {},
): StockDashboardSummary {
  const warehouse: WarehouseScope = options.warehouse ?? 'all';
  const velocityWindow: VelocityWindow = options.velocityWindow ?? 30;
  const asOfDate = resolveAsOfDate(payload, options.asOfDate);
  const startIso = warehouse === 'chennai' ? '2026-11-01' : '2026-04-01';
  const allDates = buildDateList(startIso, asOfDate);

  const products: ProductStockAnalytics[] = [];
  const categorySet = new Set<string>();
  const brandSet = new Set<string>();

  for (const item of payload.catalog) {
    const isRecoveredDuplicate = item.id.endsWith('-REC');
    const lookupSku = isRecoveredDuplicate ? item.id : item.sku;

    const chIn = payload.chennaiInflows[lookupSku];
    const chOut = payload.chennaiOutflows[lookupSku];
    const hasChennaiPresence =
      CHENNAI_SKUS.has(item.sku) && !isRecoveredDuplicate && Boolean(chIn || chOut || item.chennaiStock > 0);

    if (warehouse === 'chennai' && !hasChennaiPresence) {
      continue;
    }

    const dkIn = isRecoveredDuplicate ? undefined : payload.dankuniInflows[item.sku];
    const dkOut = isRecoveredDuplicate ? undefined : payload.dankuniOutflows[item.sku];
    const rollup = isRecoveredDuplicate ? undefined : payload.rollups[item.sku];

    // Compute accurate Chennai stock directly from inflows - outflows if present
    const chReceivedTotal = chIn?.totalReceived ?? 0;
    const chSoldTotal = chOut
      ? Object.values(chOut.byChannel).reduce((a, b) => a + b, 0)
      : 0;
    const computedChennaiStock = Math.max(0, chReceivedTotal - chSoldTotal);
    const chennaiStock = hasChennaiPresence
      ? Math.max(item.chennaiStock, computedChennaiStock)
      : item.chennaiStock;

    const dankuniStock = item.dankuniNewLogoStock;
    const oldLogoStock = item.oldLogoStock;

    let currentStock: number;
    if (warehouse === 'dankuni') {
      currentStock = dankuniStock + oldLogoStock;
    } else if (warehouse === 'chennai') {
      currentStock = chennaiStock;
    } else {
      currentStock = dankuniStock + chennaiStock + oldLogoStock;
    }

    const upcomingStock = warehouse === 'chennai' ? 0 : item.upcomingStock;

    // Merge daily inflows & outflows for the selected warehouse scope
    const inflowByDate: Record<string, number> = {};
    const outflowByDate: Record<string, number> = {};
    const channelTotals: Record<string, number> = {};

    let openStock = 0;
    let totalReceived = 0;

    if (warehouse !== 'chennai') {
      openStock += dkIn?.openStock ?? 0;
      totalReceived += dkIn?.totalReceived ?? (isRecoveredDuplicate ? dankuniStock : 0);
      if (dkIn?.byDate) {
        for (const [d, v] of Object.entries(dkIn.byDate)) {
          inflowByDate[d] = (inflowByDate[d] ?? 0) + v;
        }
      }
      if (dkOut?.byDate) {
        for (const [d, v] of Object.entries(dkOut.byDate)) {
          outflowByDate[d] = (outflowByDate[d] ?? 0) + v;
        }
      }
      if (dkOut?.byChannel) {
        for (const [ch, v] of Object.entries(dkOut.byChannel)) {
          if (ch === 'Block Stock') continue;
          channelTotals[ch] = (channelTotals[ch] ?? 0) + v;
        }
      }
    }

    if (warehouse !== 'dankuni' && hasChennaiPresence) {
      totalReceived += chReceivedTotal;
      if (chIn?.byDate) {
        for (const [d, v] of Object.entries(chIn.byDate)) {
          inflowByDate[d] = (inflowByDate[d] ?? 0) + v;
        }
      }
      if (chOut?.byDate) {
        for (const [d, v] of Object.entries(chOut.byDate)) {
          outflowByDate[d] = (outflowByDate[d] ?? 0) + v;
        }
      }
      if (chOut?.byChannel) {
        for (const [ch, v] of Object.entries(chOut.byChannel)) {
          const label = warehouse === 'all' ? `${ch} (Chennai)` : ch;
          channelTotals[label] = (channelTotals[label] ?? 0) + v;
        }
      }
    }

    const datedSoldSum = Object.values(outflowByDate).reduce((a, b) => a + b, 0);
    const channelSoldSum = Object.values(channelTotals).reduce((a, b) => a + b, 0);
    const totalSold = Math.max(datedSoldSum, channelSoldSum);

    // Find last sale date and last restock date (on or before asOfDate)
    const saleDates = Object.entries(outflowByDate)
      .filter(([d, v]) => v > 0 && d <= asOfDate)
      .map(([d]) => d)
      .sort();
    const lastSaleDate = saleDates.length ? saleDates[saleDates.length - 1] : null;

    const restockDates = Object.entries(inflowByDate)
      .filter(([d, v]) => v > 0 && d <= asOfDate)
      .map(([d]) => d)
      .sort();
    const lastRestockDate = restockDates.length ? restockDates[restockDates.length - 1] : null;

    // Reconstruct daily closing stock curve from startIso to asOfDate
    // We anchor the curve so that on `asOfDate`, the closing balance matches `currentStock`.
    // Wait: why work forward from openStock + adjustments?
    // Because openStock + sum(inflows) - sum(outflows) + returns - blockStock - stockLevelAdj + oldLogoStock
    // equals currentStock! Adding any undated offset (like oldLogoStock, returns, or future-dated entries
    // after asOfDate) to the opening baseline ensures the forward curve is both faithful to every daily
    // restock/dispatch spike AND ends at `currentStock` on `asOfDate`.
    let totalInUpToAsOf = 0;
    let totalOutUpToAsOf = 0;
    for (const d of allDates) {
      totalInUpToAsOf += inflowByDate[d] ?? 0;
      totalOutUpToAsOf += outflowByDate[d] ?? 0;
    }

    const netDatedFlow = openStock + totalInUpToAsOf - totalOutUpToAsOf;
    const undatedAdjustment = currentStock - netDatedFlow;

    const dailySeries: DailyStockPoint[] = [];
    let runningStock = Math.max(0, openStock + undatedAdjustment);

    for (const d of allDates) {
      const inf = inflowByDate[d] ?? 0;
      const out = outflowByDate[d] ?? 0;
      runningStock = Math.max(0, runningStock + inf - out);
      dailySeries.push({
        date: d,
        inflow: inf,
        outflow: out,
        stock: runningStock,
      });
    }

    // Ensure final point matches currentStock exactly
    if (dailySeries.length > 0) {
      dailySeries[dailySeries.length - 1].stock = currentStock;
    }

    // Sparkline: last 30 days
    const last30 = dailySeries.slice(-30);
    const sparkline30d = last30.map((p) => p.stock);
    const sparklineDates30d = last30.map((p) => p.date);

    // Compute Daily Velocity (in-stock days within velocityWindow)
    const windowPoints = dailySeries.slice(-velocityWindow);
    let inStockDaysInWindow = 0;
    let unitsSoldInWindow = 0;
    for (let i = 0; i < windowPoints.length; i++) {
      const pt = windowPoints[i];
      const prevStock = i > 0 ? windowPoints[i - 1].stock : pt.stock + pt.outflow - pt.inflow;
      const wasAvailable = prevStock > 0 || pt.stock > 0 || pt.outflow > 0;
      if (wasAvailable) {
        inStockDaysInWindow += 1;
        unitsSoldInWindow += pt.outflow;
      }
    }

    // Also compute all-time in-stock velocity (from first active day to last in-stock day)
    // so products that have been OOS for > velocityWindow days still have an accurate pre-OOS velocity!
    const firstActiveIdx = dailySeries.findIndex((p) => p.stock > 0 || p.inflow > 0 || p.outflow > 0);
    let allTimeInStockDays = 0;
    let allTimeSoldUnits = 0;
    if (firstActiveIdx >= 0) {
      for (let i = firstActiveIdx; i < dailySeries.length; i++) {
        const pt = dailySeries[i];
        const prevStock = i > 0 ? dailySeries[i - 1].stock : pt.stock + pt.outflow - pt.inflow;
        if (prevStock > 0 || pt.stock > 0 || pt.outflow > 0) {
          allTimeInStockDays += 1;
          allTimeSoldUnits += pt.outflow;
        }
      }
    }

    const windowVelocity =
      inStockDaysInWindow >= 3
        ? unitsSoldInWindow / inStockDaysInWindow
        : inStockDaysInWindow > 0 && unitsSoldInWindow > 0
          ? unitsSoldInWindow / velocityWindow
          : 0;

    const historicalVelocity =
      allTimeInStockDays > 0 ? allTimeSoldUnits / allTimeInStockDays : 0;

    // Pre-OOS velocity: look at the 30 in-stock days immediately preceding the stockout (or historical velocity)
    const inStockPoints = dailySeries.filter((pt, idx) => {
      const prevStock = idx > 0 ? dailySeries[idx - 1].stock : pt.stock + pt.outflow - pt.inflow;
      return prevStock > 0 || pt.stock > 0 || pt.outflow > 0;
    });
    const lastActiveInStockSlice = inStockPoints.slice(-velocityWindow);
    const preOosVelocity =
      lastActiveInStockSlice.length > 0
        ? lastActiveInStockSlice.reduce((s, p) => s + p.outflow, 0) /
          Math.max(1, lastActiveInStockSlice.length)
        : historicalVelocity;

    // Effective daily velocity for 3-month projection:
    // Use windowVelocity when product is in stock; if currently OOS with 0 window sales, use preOosVelocity
    // so 3-month demand & stockout loss reflect true demand for that product!
    const dailyVelocity = windowVelocity > 0 ? windowVelocity : currentStock <= 0 ? preOosVelocity : 0;

    // Out-of-Stock (Unavailable) Days & Stock Loss Analysis
    const isOutOfStock = currentStock <= 0;
    let currentOosDays = 0;
    let oosSinceDate: string | null = null;

    if (isOutOfStock && dailySeries.length > 0) {
      // Walk backwards from the end of dailySeries while stock <= 0 and outflow == 0
      let k = dailySeries.length - 1;
      while (k >= 0 && dailySeries[k].stock <= 0 && dailySeries[k].outflow === 0) {
        currentOosDays += 1;
        oosSinceDate = dailySeries[k].date;
        k -= 1;
      }
      // If stock was zeroed on lastSaleDate, include days since lastSaleDate
      if (currentOosDays === 0 && lastSaleDate) {
        currentOosDays = Math.max(1, diffDaysIso(lastSaleDate, asOfDate));
        oosSinceDate = addDaysIso(lastSaleDate, 1);
      }
      // Only count OOS days if the product actually had prior stock or sales
      if (totalReceived === 0 && totalSold === 0 && openStock === 0) {
        currentOosDays = 0;
        oosSinceDate = null;
      }
    }

    // Count total historical OOS days after firstActiveIdx
    let totalHistoricalOosDays = 0;
    if (firstActiveIdx >= 0) {
      for (let i = firstActiveIdx; i < dailySeries.length; i++) {
        if (dailySeries[i].stock <= 0 && dailySeries[i].outflow === 0) {
          totalHistoricalOosDays += 1;
        }
      }
    }
    totalHistoricalOosDays = Math.max(totalHistoricalOosDays, currentOosDays);

    const lostUnitsCurrentOos = isOutOfStock ? Math.round(currentOosDays * preOosVelocity) : 0;
    const lostUnitsHistoricalTotal = Math.round(totalHistoricalOosDays * preOosVelocity);

    // 3-Month (90-Day) Projection
    const availablePool = currentStock + upcomingStock;
    const daysOfCover =
      dailyVelocity > 0
        ? Math.floor(availablePool / dailyVelocity)
        : availablePool > 0
          ? null
          : 0;

    const projectedRunoutDate =
      daysOfCover !== null && dailyVelocity > 0
        ? addDaysIso(asOfDate, daysOfCover)
        : availablePool <= 0
          ? asOfDate
          : null;

    const demand30d = Math.ceil(30 * dailyVelocity);
    const demand60d = Math.ceil(60 * dailyVelocity);
    const demand90d = Math.ceil(90 * dailyVelocity);

    const stockAt30d = Math.max(0, Math.round(availablePool - 30 * dailyVelocity));
    const stockAt60d = Math.max(0, Math.round(availablePool - 60 * dailyVelocity));
    const stockAt90d = Math.max(0, Math.round(availablePool - 90 * dailyVelocity));

    const reorderNeeded90d = Math.max(0, demand90d - availablePool);
    const packagingShortfall90d =
      item.packagingCount > 0 ? Math.max(0, reorderNeeded90d - item.packagingCount) : 0;

    const projectedOosDays90d =
      dailyVelocity > 0
        ? Math.max(0, 90 - Math.min(90, daysOfCover ?? 0))
        : availablePool <= 0 && preOosVelocity > 0
          ? 90
          : 0;
    const projectedStockLoss90d = reorderNeeded90d;

    const projectedSeries: ProjectionPoint[] = [];
    for (let d = 1; d <= 90; d++) {
      const consumed = d * dailyVelocity;
      projectedSeries.push({
        date: addDaysIso(asOfDate, d),
        dayOffset: d,
        projectedStock: Math.max(0, Math.round(availablePool - consumed)),
        cumulativeLostUnits: Math.max(0, Math.round(consumed - availablePool)),
      });
    }

    // Channel breakdown sorted descending
    const channels: ChannelBreakdown[] = Object.entries(channelTotals)
      .filter(([, u]) => u > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([channel, units]) => ({
        channel,
        units,
        share: channelSoldSum > 0 ? units / channelSoldSum : 0,
      }));

    // Health classification
    let health: StockHealth = 'healthy';
    if (currentStock <= 0) {
      health = 'out_of_stock';
    } else if (daysOfCover !== null && daysOfCover < 30) {
      health = 'critical';
    } else if (daysOfCover !== null && daysOfCover < 90) {
      health = 'warning';
    }

    const status = normaliseStatus(item.status);
    categorySet.add(item.category);
    brandSet.add(item.brand);

    products.push({
      id: item.id,
      sku: item.sku,
      name: item.name,
      shortName: cleanProductName(item.name),
      status,
      category: item.category,
      brand: item.brand,
      material: item.material,
      packagingCount: item.packagingCount,
      packagingBoxName: item.packagingBoxName,
      dankuniStock,
      chennaiStock,
      oldLogoStock,
      upcomingStock,
      currentStock,
      openStock,
      totalReceived,
      totalSold,
      returns: rollup?.returns ?? 0,
      blockStock: rollup?.blockStock ?? 0,
      lastSaleDate,
      lastRestockDate,
      dailySeries,
      sparkline30d,
      sparklineDates30d,
      dailyVelocity,
      preOosVelocity,
      inStockDaysInWindow,
      daysOfCover,
      projectedRunoutDate,
      demand30d,
      demand60d,
      demand90d,
      stockAt30d,
      stockAt60d,
      stockAt90d,
      reorderNeeded90d,
      packagingShortfall90d,
      projectedSeries,
      isOutOfStock,
      oosSinceDate,
      currentOosDays,
      totalHistoricalOosDays,
      lostUnitsCurrentOos,
      lostUnitsHistoricalTotal,
      projectedOosDays90d,
      projectedStockLoss90d,
      channels,
      health,
    });
  }

  const totals = {
    skuCount: products.length,
    inStockSkuCount: products.filter((p) => !p.isOutOfStock).length,
    outOfStockSkuCount: products.filter((p) => p.isOutOfStock).length,
    criticalSkuCount: products.filter((p) => p.health === 'critical').length,
    warningSkuCount: products.filter((p) => p.health === 'warning').length,
    healthySkuCount: products.filter((p) => p.health === 'healthy').length,
    totalCurrentStock: products.reduce((s, p) => s + p.currentStock, 0),
    totalDankuniStock: products.reduce((s, p) => s + p.dankuniStock, 0),
    totalChennaiStock: products.reduce((s, p) => s + p.chennaiStock, 0),
    totalOldLogoStock: products.reduce((s, p) => s + p.oldLogoStock, 0),
    totalSoldUnits: products.reduce((s, p) => s + p.totalSold, 0),
    totalDailyVelocity: products.reduce((s, p) => s + p.dailyVelocity, 0),
    totalDemand90d: products.reduce((s, p) => s + p.demand90d, 0),
    totalReorderNeeded90d: products.reduce((s, p) => s + p.reorderNeeded90d, 0),
    totalLostUnitsCurrentOos: products.reduce((s, p) => s + p.lostUnitsCurrentOos, 0),
    totalLostUnitsHistorical: products.reduce((s, p) => s + p.lostUnitsHistoricalTotal, 0),
    totalProjectedStockLoss90d: products.reduce((s, p) => s + p.projectedStockLoss90d, 0),
  };

  return {
    asOfDate,
    warehouse,
    velocityWindow,
    products,
    categories: [...categorySet].sort(),
    brands: [...brandSet].sort(),
    totals,
  };
}

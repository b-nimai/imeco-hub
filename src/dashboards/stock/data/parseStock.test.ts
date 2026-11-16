import { describe, expect, it } from 'vitest';

import { resolveHeaderDates } from './parseDate';
import { buildStockDashboardSummary } from './parseStock';
import snapshot from './stockSnapshot.json';
import type { StockRawPayload } from './types';

describe('resolveHeaderDates', () => {
  it('resolves Dankuni mixed MM-DD-YYYY (days 1-12) and DD-MM-YYYY (days 13+)', () => {
    const headers = [
      'SKU',
      'Products Name',
      'Total Sold Items',
      '04-01-2026',
      '04-02-2026',
      '04-12-2026',
      '13-04-2026',
      '14-04-2026',
    ];
    const resolved = resolveHeaderDates(headers, 3);
    expect(resolved.map((r) => r.iso)).toEqual([
      '2026-04-01',
      '2026-04-02',
      '2026-04-12',
      '2026-04-13',
      '2026-04-14',
    ]);
  });

  it('resolves Chennai DD-MM-YYYY headers and clamps 31-11-2026 to 2026-11-30', () => {
    const headers = [
      'SKU',
      'Products Name',
      'Total Sold Items',
      '01-11-2026',
      '02-11-2026',
      '13-11-2026',
      '30-11-2026',
      '31-11-2026',
    ];
    const resolved = resolveHeaderDates(headers, 3);
    expect(resolved.map((r) => r.iso)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-13',
      '2026-11-30',
      '2026-11-30',
    ]);
  });
});

describe('buildStockDashboardSummary', () => {
  const payload = snapshot as unknown as StockRawPayload;

  it('combines Dankuni and Chennai stock accurately in all-warehouse scope', () => {
    const summary = buildStockDashboardSummary(payload, {
      warehouse: 'all',
      velocityWindow: 30,
      asOfDate: '2026-11-16',
    });

    expect(summary.products.length).toBeGreaterThan(150);

    const facialCombo = summary.products.find((p) => p.id === 'IMEFTCNP600');
    expect(facialCombo).toBeDefined();
    expect(facialCombo!.dankuniStock).toBe(12488);
    expect(facialCombo!.chennaiStock).toBe(37428);
    expect(facialCombo!.currentStock).toBe(12488 + 37428);
    expect(facialCombo!.projectedSeries).toHaveLength(90);
  });

  it('computes out-of-stock days and lost units for unavailable products', () => {
    const summary = buildStockDashboardSummary(payload, {
      warehouse: 'all',
      velocityWindow: 30,
      asOfDate: '2026-11-16',
    });

    // IMEBCT1 (Cylindrical Facial Tissue) is a Bestseller with 0 current stock and 40,372 sold
    const cyl = summary.products.find((p) => p.id === 'IMEBCT1');
    expect(cyl).toBeDefined();
    expect(cyl!.isOutOfStock).toBe(true);
    expect(cyl!.currentOosDays).toBeGreaterThan(0);
    expect(cyl!.preOosVelocity).toBeGreaterThan(0);
    expect(cyl!.lostUnitsCurrentOos).toBeGreaterThan(0);
    expect(cyl!.projectedOosDays90d).toBe(90);
    expect(cyl!.projectedStockLoss90d).toBeGreaterThan(0);
  });

  it('filters to Chennai SKUs when warehouse is chennai', () => {
    const chennaiSummary = buildStockDashboardSummary(payload, {
      warehouse: 'chennai',
      velocityWindow: 30,
      asOfDate: '2026-11-16',
    });

    expect(chennaiSummary.products.map((p) => p.sku)).toEqual([
      'IMEFTCNP600',
      'IMEGHFT600',
      'IMEGHTT',
    ]);
    expect(chennaiSummary.totals.totalCurrentStock).toBe(37428);
  });

  it('reconciles 100% of all 162 catalog items against raw sheet stock and sold totals', () => {
    const allSummary = buildStockDashboardSummary(payload, {
      warehouse: 'all',
      velocityWindow: 30,
      asOfDate: '2026-11-16',
    });
    const dkSummary = buildStockDashboardSummary(payload, {
      warehouse: 'dankuni',
      velocityWindow: 30,
      asOfDate: '2026-11-16',
    });

    expect(allSummary.products).toHaveLength(payload.catalog.length);

    for (let i = 0; i < payload.catalog.length; i++) {
      const raw = payload.catalog[i];
      const allProd = allSummary.products[i];
      const dkProd = dkSummary.products[i];

      // Dankuni stock and Chennai stock must match Total Stock Col F & Col G on every row
      expect(allProd.dankuniStock).toBe(raw.dankuniNewLogoStock);
      expect(allProd.chennaiStock).toBe(raw.chennaiStock);
      expect(allProd.currentStock).toBe(raw.dankuniNewLogoStock + raw.chennaiStock);
      expect(dkProd.currentStock).toBe(raw.dankuniNewLogoStock);

      // Final day of dailySeries must match currentStock
      expect(allProd.dailySeries[allProd.dailySeries.length - 1].stock).toBe(allProd.currentStock);
      expect(dkProd.dailySeries[dkProd.dailySeries.length - 1].stock).toBe(dkProd.currentStock);
    }

    // Verify aggregate totals for Bestseller + Active (42 SKUs)
    const liveProds = allSummary.products.filter(
      (p) => p.status === 'Bestseller' || p.status === 'Active',
    );
    expect(liveProds).toHaveLength(42);
    expect(liveProds.reduce((s, p) => s + p.dankuniStock, 0)).toBe(617356);
    expect(liveProds.reduce((s, p) => s + p.chennaiStock, 0)).toBe(37428);
    expect(liveProds.reduce((s, p) => s + p.currentStock, 0)).toBe(654784);
  });
});

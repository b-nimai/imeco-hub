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
});

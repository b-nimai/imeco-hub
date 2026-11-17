import { describe, expect, it } from 'vitest';

import { resolveHeaderDates } from './parseDate';
import { buildStockDashboardSummary, verifyChennaiStock } from './parseStock';
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

  it('includes renamed/new Chennai SKUs and uses Total Stock Col G as Chennai stock', () => {
    const base = payload.catalog.find((c) => c.sku === 'IMEGHTTP6')!;
    const live: StockRawPayload = {
      ...payload,
      catalog: payload.catalog.map((c) =>
        c.sku === 'IMEFTCNP600'
          ? { ...c, chennaiStock: 38448 }
          : c.sku === 'IMEGHFT600'
            ? { ...c, chennaiStock: 19440 }
            : c.sku === 'IMEGHTTP6'
              ? { ...base, chennaiStock: 17632 }
              : c,
      ),
      chennaiInflows: {
        IMEFTCNP600: { totalReceived: 38448, byDate: { '2026-11-01': 38448 } },
        IMEGHFT600: { totalReceived: 19440, byDate: { '2026-11-12': 19440 } },
        IMEGHTTP6: { totalReceived: 17632, byDate: { '2026-11-13': 17632 } },
      },
      // Sold rows that would make received - sold disagree with the sheet
      chennaiOutflows: {
        IMEFTCNP600: { byDate: {}, byChannel: { Blinkit: 500 } },
      },
    } as StockRawPayload;

    const summary = buildStockDashboardSummary(live, {
      warehouse: 'chennai',
      velocityWindow: 30,
      asOfDate: '2026-11-16',
    });
    const bySku = Object.fromEntries(summary.products.map((p) => [p.sku, p.chennaiStock]));
    expect(bySku).toEqual({ IMEFTCNP600: 38448, IMEGHFT600: 19440, IMEGHTTP6: 17632 });
    expect(summary.totals.totalCurrentStock).toBe(38448 + 19440 + 17632);
  });

  it('prefers the Chennai CURRENT tab over Total Stock Col G when the proxy provides it', () => {
    const live = {
      ...payload,
      chennaiCurrent: { IMEFTCNP600: 40000, IMEGHTTP6: 17632 },
    } as StockRawPayload;
    const summary = buildStockDashboardSummary(live, {
      warehouse: 'chennai',
      velocityWindow: 30,
      asOfDate: '2026-11-16',
    });
    const bySku = Object.fromEntries(summary.products.map((p) => [p.sku, p.chennaiStock]));
    expect(bySku.IMEFTCNP600).toBe(40000);
    expect(bySku.IMEGHTTP6).toBe(17632);
  });

  it('cross-checks Chennai stock between Total Stock Col G and the Chennai CURRENT tab', () => {
    const live = {
      ...payload,
      catalog: payload.catalog.map((c) =>
        c.sku === 'IMEGHFT600' ? { ...c, chennaiStock: 19440 } : c,
      ),
      chennaiCurrent: {
        IMEFTCNP600: 37428, // matches Col G -> verified
        IMEGHFT600: 19000, // Col G says 19440 -> mismatch
        IMEGHTTP6: 17632, // Col G says 0 -> mismatch (Col G not updated)
        'NEW-SKU': 50, // not in Total Stock -> missing from catalog
      },
    } as StockRawPayload;

    const v = verifyChennaiStock(live);
    expect(v.currentTabAvailable).toBe(true);
    expect(v.verifiedCount).toBe(1);
    expect(v.mismatches.map((m) => [m.sku, m.currentTab, m.sheetG])).toEqual([
      ['IMEGHFT600', 19000, 19440],
      ['IMEGHTTP6', 17632, 0],
    ]);
    expect(v.missingFromCatalog).toEqual([{ sku: 'NEW-SKU', stock: 50 }]);

    const summary = buildStockDashboardSummary(live, { warehouse: 'chennai', asOfDate: '2026-11-16' });
    const ft = summary.products.find((p) => p.sku === 'IMEGHFT600')!;
    expect(ft.chennaiCheck).toBe('mismatch');
    expect(ft.chennaiStock).toBe(19000);
    expect(ft.chennaiStockSheetG).toBe(19440);
    expect(summary.products.find((p) => p.sku === 'IMEFTCNP600')!.chennaiCheck).toBe('verified');
  });

  it('marks Chennai stock as not cross-checked when the proxy has no CURRENT tab', () => {
    const v = verifyChennaiStock(payload);
    expect(v.currentTabAvailable).toBe(false);
    expect(v.mismatches).toHaveLength(0);
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

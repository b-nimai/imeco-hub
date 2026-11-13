import { describe, expect, it, vi } from 'vitest';

import { DRP_TAB, GROUPS } from './channels';
import {
  ALL_RANGES,
  DRP_RANGE,
  buildRanges,
  dispatchRange,
  parseDispatchData,
} from './parseSheet';
import { PRODUCT_DISPLAY_NAMES } from './products';
import type { RangeMap } from './sheetsClient';

// The fixtures are REAL snapshots of the Outbound Tracker (unit volumes per SKU and channel),
// so they are gitignored and never reach the public repo. Loaded optionally: where they exist
// (a dev machine that has them) every test runs; elsewhere (a fresh clone, CI) the suites that
// need them are skipped instead of failing the build.
const FIXTURES = import.meta.glob<{ default: unknown }>('./__fixtures__/*.json', { eager: true });
const fixtureFile = FIXTURES['./__fixtures__/outbound-tracker.json'];
const drpFile = FIXTURES['./__fixtures__/drp-2026-10-06.json'];
const HAS_FIXTURES = Boolean(fixtureFile && drpFile);
const fixture = (fixtureFile?.default ?? {}) as RangeMap;
const drpOct = (drpFile?.default ?? {}) as RangeMap;
const describeWithData = describe.skipIf(!HAS_FIXTURES);

// A real batchGet snapshot of `Outbound Tracker`, taken 2026-07-27. Its job is to catch the
// parser silently losing a column — the failure mode that would make the timeline quietly
// under-count while still looking plausible.
// Parsed with the clock pinned to the snapshot day: "future-dated" columns are judged against
// today, so against the real clock the 31-Jul planned dispatches stopped being future on 1 Aug.
vi.useFakeTimers({ now: new Date('2026-07-27T12:00:00+05:30'), toFake: ['Date'] });
const data = HAS_FIXTURES
  ? parseDispatchData(fixture)
  : (null as unknown as ReturnType<typeof parseDispatchData>);
vi.useRealTimers();

describeWithData('parseDispatchData', () => {
  it('reads all 23 SKUs, in Total Sold order-independent form', () => {
    expect(data.skus).toHaveLength(23);
    expect(data.skus[0].id).toBe('IMEFTCNP600');
    expect(data.heatmapRows).toHaveLength(23);
  });

  it('reconciles the dated tabs against the sheet-maintained all-time totals', () => {
    // THE load-bearing assertion. Both sides are computed independently: one by summing
    // parsed date columns, the other straight from Dashboard Ready Product.
    for (const r of data.reconciliation) {
      if (r.channel === 'other') continue; // covered separately below
      expect(`${r.channel}:${r.delta}`).toBe(`${r.channel}:0`);
    }
  });

  it('reports how much of `other` still has no dated tab behind it', () => {
    // This snapshot was taken before tab discovery existed, so it contains only the 11
    // marketplace tabs — every one of `other`'s 90,588 units is all-time-only here. Once the
    // workbook's CRED / Shopify / Instamart tabs are read, `fromTabs` rises and this delta
    // closes; it is the meter for how complete `other` is, not a pass/fail.
    const other = data.reconciliation.find((r) => r.channel === 'other')!;
    expect(other.allTime).toBe(90588);
    expect(other.fromTabs).toBe(0);
    expect(other.delta).toBe(-90588);
  });

  it('matches the known group totals', () => {
    expect(data.columnTotals).toMatchObject({
      blinkit: 317807,
      amazonB2B: 135802,
      flipkart: 95133,
      meesho: 24866,
      amazon: 14665,
      myntra: 10688,
    });
    expect(data.grandTotal).toBe(598961);
  });

  it('every heatmap row sums to that SKU Total Sold (so `other` closes the gap)', () => {
    for (const row of data.heatmapRows) {
      expect(`${row.sku.id}:${row.rowTotal}`).toBe(`${row.sku.id}:${row.sku.totalSold}`);
    }
  });

  it('attributes the 5 undated PO columns rather than dropping their 33,539 units', () => {
    expect(data.backfillNotes).toHaveLength(5);
    const tabs = [...new Set(data.backfillNotes.map((n) => n.tab))].sort();
    expect(tabs).toEqual(['BLINKIT', 'RK World']);

    const total = data.backfillNotes.reduce((s, n) => s + n.units, 0);
    expect(total).toBe(33539);
    // Every one landed on a real date.
    expect(data.backfillNotes.every((n) => n.attributedTo)).toBe(true);
  });

  it('produces sorted, de-duplicated dates', () => {
    const sorted = [...data.dates].sort();
    expect(data.dates).toEqual(sorted);
    expect(new Set(data.dates).size).toBe(data.dates.length);
    expect(data.dates[0]).toBe('2026-04-01');
  });

  it('excludes future-dated FBF columns from Last Dispatch', () => {
    // FBF carries planned dispatches out to 31-Jul; the KPI must not report those as shipped.
    expect(data.dates).toContain('2026-07-31');
    expect(data.lastDispatch).not.toBe('2026-07-31');
    expect(data.lastDispatch! <= new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it('parses cleanly — no warnings against the real sheet', () => {
    expect(data.warnings).toEqual([]);
  });

  it('daily points carry every group key', () => {
    for (const point of data.daily) {
      for (const g of GROUPS) expect(point[g.key]).toBeTypeOf('number');
    }
  });
});

describeWithData('heatmap scopes', () => {
  const months = (data?.scopes ?? []).filter((s) => s.key !== 'all');

  it('is all-time followed by every month, ascending', () => {
    expect(data.scopes[0].key).toBe('all');
    expect(months.map((s) => s.key)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
    expect(months.map((s) => s.label)).toEqual(['Apr', 'May', 'Jun', 'Jul']);
  });

  it('loses nothing to month bucketing — the months sum to the 6-group total', () => {
    // THE load-bearing assertion for month tabs, and the mirror of the timeline
    // reconciliation above: rebuilding the grid per month from the dated columns must
    // recover every unit the all-time groups hold, backfilled columns included.
    const summed = months.reduce((s, m) => s + m.displayedTotal, 0);
    expect(summed).toBe(data.grandTotal);
    expect(summed).toBe(598961);
  });

  it('matches the known per-month totals', () => {
    // Dated columns alone give Apr 118,134 · May 151,674 · Jun 198,848 · Jul 96,766. The
    // remaining 33,539 units sit in the 5 undated PO columns and are attributed to their
    // nearest dated neighbour, which puts 11,951 in Jun and 21,588 in Jul.
    expect(Object.fromEntries(months.map((m) => [m.key, m.displayedTotal]))).toEqual({
      '2026-04': 118134,
      '2026-05': 151674,
      '2026-06': 210799,
      '2026-07': 118354,
    });
  });

  it('keeps every month grid aligned 1:1 with the SKU list', () => {
    for (const m of months) {
      expect(m.rows.map((r) => r.sku.id)).toEqual(data.skus.map((s) => s.id));
      expect(m.rows.every((r) => r.rowTotal === GROUPS.reduce((s, g) => s + r.cells[g.key], 0)));
    }
  });

  it('carries `other` on all time only — the months have no dated source for it', () => {
    const allTime = data.scopes[0];
    expect(allTime.hasOther).toBe(true);
    expect(allTime.rows).toBe(data.heatmapRows); // the sheet's own grid, not a re-derivation
    expect(allTime.displayedTotal).toBe(689549); // includes the 90,588 `other` units

    for (const m of months) {
      expect(m.hasOther).toBe(false);
      expect(m.rows.every((r) => r.cells.other === 0)).toBe(true);
    }
  });

  it('never reports a future-dated dispatch as the scope last dispatch', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const s of data.scopes) {
      if (s.lastDispatch) expect(s.lastDispatch <= today).toBe(true);
    }
  });
});

describeWithData('tab discovery', () => {
  it('requests every tab in the workbook except the rollup', () => {
    const ranges = buildRanges([DRP_TAB, 'BLINKIT', 'CRED', 'Swiggy Instamart']);
    expect(ranges).toEqual([
      ALL_RANGES[0],
      dispatchRange('BLINKIT'),
      dispatchRange('CRED'),
      dispatchRange('Swiggy Instamart'),
    ]);
  });

  it('falls back to the known marketplace tabs when the tab list is unavailable', () => {
    expect(buildRanges([])).toEqual(ALL_RANGES);
    expect(buildRanges([DRP_TAB])).toEqual(ALL_RANGES);
  });

  it('folds a discovered non-marketplace tab into `other`, month-wise', () => {
    // The whole point of discovery: a tab outside the 6 groups contributes dated units, so
    // `other` stops being an all-time-only bucket. Modelled on the real tab shape — row 2 is
    // the header, rows 3+ are the same SKUs in the same order, dates from column E.
    const skuRows = (fixture as unknown as RangeMap)[dispatchRange('BLINKIT')].slice(1);
    const cred = [
      ['SKU ID', 'Product Name', 'Product Name (V2)', 'Total', '05-Jun-2026', '06-Jul-2026'],
      ...skuRows.map((r, i) => [r[0], r[1], r[2], '', i === 0 ? '400' : '', i === 1 ? '250' : '']),
    ];

    const withCred = parseDispatchData({
      ...(fixture as unknown as RangeMap),
      [dispatchRange('CRED')]: cred,
    });

    const byKey = Object.fromEntries(withCred.scopes.map((s) => [s.key, s]));
    expect(byKey['2026-06'].columnTotals.other).toBe(400);
    expect(byKey['2026-07'].columnTotals.other).toBe(250);
    expect(byKey['2026-06'].hasOther).toBe(true);
    // April saw no CRED dispatch, so its `other` is a real zero, not an unknown.
    expect(byKey['2026-04'].columnTotals.other).toBe(0);
    expect(byKey['2026-04'].hasOther).toBe(false);

    // The units land on the right products, and roll into those products' month totals.
    expect(byKey['2026-06'].rows[0].cells.other).toBe(400);
    expect(byKey['2026-07'].rows[1].cells.other).toBe(250);

    // And they show up in the reconciliation meter rather than vanishing.
    const other = withCred.reconciliation.find((r) => r.channel === 'other')!;
    expect(other.fromTabs).toBe(650);
  });

  it('rejects a discovered tab that is not SKU-shaped rather than inventing units', () => {
    // A notes or summary sheet would otherwise be folded straight into `other`.
    const notes = [
      ['Heading', '', '', '', '01-Jun-2026'],
      ['some note', '', '', '', '9999'],
    ];
    const withNotes = parseDispatchData({
      ...(fixture as unknown as RangeMap),
      [dispatchRange('Notes')]: notes,
    });

    const other = withNotes.reconciliation.find((r) => r.channel === 'other')!;
    expect(other.fromTabs).toBe(0);
    expect(withNotes.grandTotal).toBe(data.grandTotal);
  });
});

// `Dashboard Ready Product` as of 2026-10-06, after the sheet grew: a `MEESHO BUTTER PAPER`
// helper column inserted at D (pushing `Total Sold` to E), `Influencer` and `MYNTRA  PO` added
// past AC, and 2 SKUs added below row 25. The parser used to assume `Total` at D and a fixed
// `A2:AC25`, which read `Total Sold` as a channel and showed every product at ~2× its sales.
const oct = HAS_FIXTURES
  ? parseDispatchData(drpOct)
  : (null as unknown as ReturnType<typeof parseDispatchData>);

describeWithData('rollup layout drift (2026-10-06 snapshot)', () => {
  it('reads all 25 SKUs, including the ones below row 25', () => {
    expect(oct.skus).toHaveLength(25);
    expect(oct.skus.map((s) => s.id)).toContain('IMEGHNWKT80B');
  });

  it("totals exactly the sheet's own Total Sold — nothing doubled, nothing dropped", () => {
    expect(oct.scopes[0].displayedTotal).toBe(1102540);
    const sku = oct.skus.find((s) => s.id === 'IMEGBNPM30_1')!;
    expect(sku.totalSold).toBe(317775);
  });

  it('every row sums to its Total Sold, so columns left of it are not channels', () => {
    // IMERBT1 carries 21,588 in `MEESHO BUTTER PAPER`, which the sheet's own SUM excludes.
    for (const row of oct.heatmapRows) {
      expect(`${row.sku.id}:${row.rowTotal}`).toBe(`${row.sku.id}:${row.sku.totalSold}`);
    }
    // Only the rollup is in this snapshot, so the tabs-vs-rollup reconciliation warnings are
    // expected; a row-sum warning is not.
    expect(oct.warnings.filter((w) => w.includes('Total Sold'))).toEqual([]);
  });

  it('folds the columns past AC into their groups', () => {
    // `MYNTRA  PO` (double space) is a Myntra column; the hair brush has 1,700 there.
    const brush = oct.heatmapRows.find((r) => r.sku.id === 'IMEBPB1')!;
    expect(brush.cells.myntra).toBe(1853 + 1700);
  });

  it('requests open-ended rows and columns', () => {
    expect(Object.keys(drpOct)).toEqual([DRP_RANGE]);
  });
});

describeWithData('new products', () => {
  // Built from the July snapshot: a product added to the rollup before any channel tab
  // carries it — the normal order of events when the sheet grows.
  const base = fixture as unknown as RangeMap;
  const drp = base[DRP_RANGE] ?? [];
  const newRow: string[] = (drp[1] ?? []).map((_, i) =>
    i === 0 ? 'IMENEW1' : i === 1 ? 'Brand New Product' : '',
  );
  newRow[3] = '40'; // Total Sold — `Total` is at D in this older layout
  newRow[4] = '40'; // its first channel column (Amazon)
  const withNew = HAS_FIXTURES
    ? parseDispatchData({
        ...base,
        [DRP_RANGE]: [...drp, newRow, ['Grand Total', '', '', '689589']],
      })
    : (null as unknown as ReturnType<typeof parseDispatchData>);

  it('shows up with no code change, under its sheet name until a short one is added', () => {
    const sku = withNew.skus.find((s) => s.id === 'IMENEW1')!;
    expect(sku.name).toBe('Brand New Product');
    expect(withNew.scopes[0].rows.map((r) => r.sku.id)).toContain('IMENEW1');
    expect(withNew.scopes.every((s) => s.rows.length === 24)).toBe(true);
  });

  it('keeps every channel tab even though none of them lists the new SKU yet', () => {
    // The only warning is the honest one: the rollup has 40 Amazon units no dated tab holds.
    expect(withNew.warnings).toEqual(['Amazon: tabs 14665 vs all-time 14705 (Δ -40)']);
    expect(withNew.reconciliation.find((r) => r.channel === 'amazon')!.delta).toBe(-40);
    const months = withNew.scopes.filter((s) => s.key !== 'all');
    expect(months.reduce((s, m) => s + m.displayedTotal, 0)).toBe(598961);
  });

  it('does not read a totals row under the products as a product', () => {
    expect(withNew.skus.some((s) => /total/i.test(s.id))).toBe(false);
    expect(withNew.scopes[0].displayedTotal).toBe(689549 + 40);
  });

  it('counts a tab that lists products in a different order', () => {
    const blinkit = base[dispatchRange('BLINKIT')];
    const shuffled = [blinkit[0], ...blinkit.slice(1).reverse()];
    const d = parseDispatchData({ ...base, [dispatchRange('BLINKIT')]: shuffled });
    expect(d.warnings).toEqual([]);
    expect(d.scopes.find((s) => s.key === '2026-07')!.rows).toEqual(
      data.scopes.find((s) => s.key === '2026-07')!.rows,
    );
  });
});

describeWithData('product display names', () => {
  it('covers every SKU in the sheet, and names nothing that is not in it', () => {
    // Guards both directions: a SKU added to the sheet would otherwise silently show its raw
    // 76-character name on the wall, and a re-keyed SKU would leave a dead override behind.
    // Checked against the newest snapshot — the July one predates the last 2 SKUs.
    const sheetIds = oct.skus.map((s) => s.id).sort();
    expect(Object.keys(PRODUCT_DISPLAY_NAMES).sort()).toEqual(sheetIds);
  });

  it('uses the override for display and keeps the sheet name for hover', () => {
    const sku = data.skus.find((s) => s.id === 'IMEGHTTP6')!;
    expect(sku.name).toBe('Good Habbit Toilet Roll (160 pulls x 6)');
    expect(sku.sheetName).toBe(
      'IMECO GOOD HABIT 3 PLY 160 PULLS EACH TOILET PAPER ROLL (160X 6 - PACK OF 6)',
    );
  });
});

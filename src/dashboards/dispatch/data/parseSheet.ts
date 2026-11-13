// batchGet response → everything the heatmap renders.
//
// Two independent paths, deliberately:
//   • The all-time scope comes straight from `Dashboard Ready Product`, which the sheet
//     maintains itself. No aggregation, so no drift.
//   • The month scopes and the daily series are aggregated from the 11 dispatch tabs.
// `reconciliation` compares the two. They must match exactly; a mismatch means the column
// parser dropped something.

import {
  DISPATCH_TABS,
  DRP_TAB,
  GROUPS,
  GROUP_BY_KEY,
  OTHER_KEY,
  groupForTab,
  heatmapColumnForDrpHeader,
  heatmapColumnForTab,
  normaliseChannel,
  type GroupKey,
  type HeatmapColumnKey,
} from './channels';
import { formatMonth, num, parseNum } from './format';
import { parseDispatchDate, toIsoKey } from './parseDate';
import { displayName } from './products';
import type { RangeMap } from './sheetsClient';

/** Row 2 is the header, SKUs start at row 3. Requested from row 2 so the header lands at
 *  index 0. */
export const HEADER_ROW_OFFSET = 0;
export const FIRST_DATA_ROW = 1;
/**
 * Last sheet row requested. Rows AND columns are open-ended: the sheet grows a SKU or a
 * channel column without warning (it went from 23 to 25 SKUs and AC to AE), and a fixed
 * `A2:AC25` silently dropped both. The API trims trailing empty rows, so the headroom is free.
 */
const LAST_ROW = 200;

export const DRP_RANGE = `'${DRP_TAB}'!2:${LAST_ROW}`;

export function dispatchRange(tab: string): string {
  return `'${tab}'!2:${LAST_ROW}`;
}

/** Recovers the tab name from a dispatch range key, so the parser can work off whatever
 *  ranges it was actually handed rather than a hardcoded list. */
const DISPATCH_RANGE_RE = new RegExp(`^'(.+)'!2:${LAST_ROW}$`);

/**
 * A footer row (`Total`, `Grand Total`) under the products. Rows are read open-ended so a new
 * product shows up on its own — which also means a totals row would be read as a product and
 * double-count everything above it.
 */
function isTotalRow(skuCell: string): boolean {
  return /^(GRAND )?TOTALS?$/.test(normaliseChannel(skuCell));
}

/** `Total` on the dated tabs, `Total Sold` on the rollup. */
const TOTAL_HEADER_RE = /^TOTAL( SOLD)?$/;

/**
 * Index of the tab's Total column, found by header rather than position.
 *
 * Value columns are everything to its right. Anything to its left (SKU, names, and helper
 * columns like the rollup's `MEESHO BUTTER PAPER`) is not a channel — matching the sheet's own
 * `Total Sold = SUM(<right of Total>)`. Hardcoding `Total` at D broke the day a column was
 * inserted before it: `Total Sold` was then read as a channel, doubling every row.
 */
export function totalColumn(header: string[]): number {
  return header.findIndex((h) => TOTAL_HEADER_RE.test(normaliseChannel(h)));
}

export const DISPATCH_RANGES = DISPATCH_TABS.map(dispatchRange);
/** Fallback when the workbook's tab list is unavailable: the 6 groups' known tabs only. */
export const ALL_RANGES = [DRP_RANGE, ...DISPATCH_RANGES];

/**
 * Ranges to request, given every tab title in the workbook.
 *
 * Every tab except the rollup is read. Tabs outside the 6 marketplace groups fold into
 * `other`, and anything that turns out not to be a per-SKU dispatch tab is rejected during
 * parsing by the SKU-alignment check rather than being guessed at here.
 */
export function buildRanges(tabTitles: string[]): string[] {
  const tabs = tabTitles.filter((t) => t.trim() && t !== DRP_TAB);
  if (!tabs.length) return ALL_RANGES;
  return [DRP_RANGE, ...tabs.map(dispatchRange)];
}

export interface Sku {
  id: string;
  /** Wall-display name — the short override where one exists, else `sheetName`. */
  name: string;
  /** Verbatim `Product Name` from the sheet, so hover can always recover the real identity. */
  sheetName: string;
  totalSold: number;
}

export interface HeatmapRow {
  sku: Sku;
  cells: Record<HeatmapColumnKey, number>;
  /** Sum of cells — equals sku.totalSold when the sheet is self-consistent. */
  rowTotal: number;
}

/** `all` plus one entry per calendar month, in that order. */
export const ALL_SCOPE_KEY = 'all';

/**
 * One tab's worth of heatmap: the grid, its totals, and the freshness facts that describe it.
 *
 * The all-time scope is the sheet's own `Dashboard Ready Product` grid, so it carries the
 * `other` bucket (14 non-marketplace channels — CRED, Shopify, Swiggy…). Month scopes are
 * rebuilt from the dated dispatch tabs, which have no `other` source at all, so their `other`
 * column is structurally empty and `hasOther` is false. That is why the month totals do not
 * sum to the all-time total: the difference is exactly `other`.
 */
export interface HeatmapScope {
  /** `all`, or a `YYYY-MM` month key. */
  key: string;
  /** Tab label: `All time`, or `Jul` / `Jul '26` when the data spans more than one year. */
  label: string;
  /** Same SKU order as `skus` — callers do the sorting they want. */
  rows: HeatmapRow[];
  columnTotals: Record<HeatmapColumnKey, number>;
  /** Sum of every cell this scope actually shows. Includes `other` only when `hasOther`. */
  displayedTotal: number;
  hasOther: boolean;
  /** Latest dispatch date in scope that is not in the future. */
  lastDispatch: string | null;
  dispatchDays: number;
}

/** One column whose header carried no date, and where its units were placed. */
export interface BackfillNote {
  tab: string;
  channel: HeatmapColumnKey;
  header: string;
  units: number;
  attributedTo: string | null;
}

export type DailyPoint = { date: string } & Partial<Record<GroupKey, number>>;

/**
 * Per-channel cross-check: units summed from the dated tabs vs the sheet's own all-time
 * rollup. They must match exactly; a mismatch means the column parser dropped something.
 */
export interface Reconciliation {
  channel: HeatmapColumnKey;
  fromTabs: number;
  allTime: number;
  delta: number;
}

export interface DispatchData {
  skus: Sku[];
  /** Sorted ISO date keys with at least one unit dispatched. */
  dates: string[];
  daily: DailyPoint[];
  /** Units attributed from undated columns, keyed `${iso}|${group}`. */
  backfillByPoint: Record<string, number>;
  backfillNotes: BackfillNote[];
  heatmapRows: HeatmapRow[];
  columnTotals: Record<HeatmapColumnKey, number>;
  /** Units summed from the dated tabs, per channel — the independent side of `reconciliation`. */
  channelTabTotals: Record<HeatmapColumnKey, number>;
  /** All-time units across the 6 marketplace groups only — the reconciliation baseline. */
  grandTotal: number;
  lastDispatch: string | null;
  reconciliation: Reconciliation[];
  /** `[allTime, ...months ascending]` — one per heatmap tab. */
  scopes: HeatmapScope[];
  warnings: string[];
}

interface ColumnSpec {
  index: number;
  header: string;
  /** Resolved from the header, or inherited from a neighbour when the header had no date. */
  iso: string | null;
  dated: boolean;
}

/**
 * Resolve every value column to a date.
 *
 * Undated columns inherit the nearest dated column to their LEFT (columns run roughly
 * chronologically, so the left neighbour is the preceding dispatch). A leading undated
 * column instead borrows from the first dated column to its right.
 */
function resolveColumns(header: string[], firstValueCol: number): ColumnSpec[] {
  const specs: ColumnSpec[] = [];
  for (let c = firstValueCol; c < header.length; c++) {
    const raw = header[c] ?? '';
    if (!String(raw).trim()) continue;
    const d = parseDispatchDate(raw);
    specs.push({ index: c, header: String(raw), iso: d ? toIsoKey(d) : null, dated: !!d });
  }

  let lastSeen: string | null = null;
  for (const s of specs) {
    if (s.dated) lastSeen = s.iso;
    else s.iso = lastSeen;
  }
  // Leading undated columns had nothing to their left — take the first date to the right.
  let nextSeen: string | null = null;
  for (let i = specs.length - 1; i >= 0; i--) {
    if (specs[i].dated) nextSeen = specs[i].iso;
    else if (specs[i].iso === null) specs[i].iso = nextSeen;
  }
  return specs;
}

function emptyColumnTotals(): Record<HeatmapColumnKey, number> {
  const out = { [OTHER_KEY]: 0 } as Record<HeatmapColumnKey, number>;
  for (const g of GROUPS) out[g.key] = 0;
  return out;
}

function parseHeatmap(rows: string[][], warnings: string[]) {
  const header = rows[HEADER_ROW_OFFSET] ?? [];
  const totalCol = totalColumn(header);
  if (totalCol < 0) throw new Error(`"${DRP_TAB}" has no "Total Sold" column`);
  const columnKeys: (HeatmapColumnKey | undefined)[] = [];
  for (let c = totalCol + 1; c < header.length; c++) {
    // A blank header is spacing, not a channel.
    if (String(header[c] ?? '').trim()) columnKeys[c] = heatmapColumnForDrpHeader(header[c]);
  }

  const skus: Sku[] = [];
  const heatmapRows: HeatmapRow[] = [];
  const columnTotals = emptyColumnTotals();

  for (let r = FIRST_DATA_ROW; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const id = String(row[0] ?? '').trim();
    if (!id || isTotalRow(id)) continue;

    const sheetName = String(row[1] ?? '').trim() || id;
    const sku: Sku = {
      id,
      name: displayName(id, sheetName),
      sheetName,
      totalSold: num(row[totalCol]),
    };
    const cells = emptyColumnTotals();
    let rowTotal = 0;

    for (let c = totalCol + 1; c < header.length; c++) {
      const key = columnKeys[c];
      if (!key) continue;
      const v = num(row[c]);
      cells[key] += v;
      rowTotal += v;
      columnTotals[key] += v;
    }

    if (rowTotal !== sku.totalSold) {
      warnings.push(
        `${DRP_TAB}: ${id} channel columns sum to ${rowTotal} but Total Sold reads ${sku.totalSold}`,
      );
    }

    skus.push(sku);
    heatmapRows.push({ sku, cells, rowTotal });
  }

  return { skus, heatmapRows, columnTotals };
}

interface ScopeInput {
  skus: Sku[];
  heatmapRows: HeatmapRow[];
  columnTotals: Record<HeatmapColumnKey, number>;
  byMonth: Map<string, Map<string, Record<HeatmapColumnKey, number>>>;
  dates: string[];
  lastDispatch: string | null;
  todayIso: string;
}

const ALL_COLUMN_KEYS: HeatmapColumnKey[] = [...GROUPS.map((g) => g.key), OTHER_KEY];

/**
 * `[allTime, ...months ascending]`.
 *
 * The all-time scope hands back the DRP grid by reference — it is the sheet's own answer and
 * re-deriving it would only invite drift. Month scopes are built from the dated tabs, and
 * cover every channel that has one, `other` included.
 */
function buildScopes({
  skus,
  heatmapRows,
  columnTotals,
  byMonth,
  dates,
  lastDispatch,
  todayIso,
}: ScopeInput): HeatmapScope[] {
  const monthKeys = [...byMonth.keys()].sort();
  // Only disambiguate when it earns its width — "Jul" until the data crosses a year boundary.
  const multiYear = new Set(monthKeys.map((m) => m.slice(0, 4))).size > 1;

  const allTime: HeatmapScope = {
    key: ALL_SCOPE_KEY,
    label: 'All time',
    rows: heatmapRows,
    columnTotals,
    displayedTotal: heatmapRows.reduce((s, r) => s + r.rowTotal, 0),
    hasOther: true,
    lastDispatch,
    dispatchDays: dates.length,
  };

  const months = monthKeys.map((key): HeatmapScope => {
    const bySku = byMonth.get(key)!;
    const scopeTotals = emptyColumnTotals();
    const rows = skus.map((sku): HeatmapRow => {
      const cells = bySku.get(sku.id) ?? emptyColumnTotals();
      let rowTotal = 0;
      for (const k of ALL_COLUMN_KEYS) {
        rowTotal += cells[k];
        scopeTotals[k] += cells[k];
      }
      return { sku, cells, rowTotal };
    });

    const monthDates = dates.filter((d) => d.startsWith(key));
    return {
      key,
      label: formatMonth(key, multiYear),
      rows,
      columnTotals: scopeTotals,
      displayedTotal: ALL_COLUMN_KEYS.reduce((s, k) => s + scopeTotals[k], 0),
      // Only false when the workbook has no dated tab for any `other` channel — then the
      // column is genuinely unanswerable for this month rather than merely zero.
      hasOther: scopeTotals[OTHER_KEY] > 0,
      lastDispatch: [...monthDates].reverse().find((d) => d <= todayIso) ?? null,
      dispatchDays: monthDates.length,
    };
  });

  return [allTime, ...months];
}

export function parseDispatchData(ranges: RangeMap): DispatchData {
  const warnings: string[] = [];

  const drpRows = ranges[DRP_RANGE] ?? [];
  if (!drpRows.length) throw new Error(`No data returned for "${DRP_TAB}"`);
  const { skus, heatmapRows, columnTotals } = parseHeatmap(drpRows, warnings);
  const knownSkuIds = new Set(skus.map((s) => s.id));

  // date -> channel -> units
  const byDate = new Map<string, Map<HeatmapColumnKey, number>>();
  // month -> skuId -> channel -> units. This is the month heatmap; it needs the per-SKU value
  // that a whole-column sum throws away.
  const byMonth = new Map<string, Map<string, Record<HeatmapColumnKey, number>>>();
  const backfillByPoint: Record<string, number> = {};
  const backfillNotes: BackfillNote[] = [];
  const channelTabTotals = emptyColumnTotals();

  // Whatever dispatch ranges we were handed — discovered from the workbook when the tab list
  // was available, the 6 groups' known tabs otherwise.
  const dispatchTabs = Object.keys(ranges)
    .map((key) => DISPATCH_RANGE_RE.exec(key)?.[1])
    // The rollup's range has the same shape as a dispatch tab's; it is not one.
    .filter((tab): tab is string => !!tab && tab !== DRP_TAB);

  for (const tab of dispatchTabs) {
    const rows = ranges[dispatchRange(tab)] ?? [];
    const group = groupForTab(tab);
    if (!rows.length) {
      // Only worth flagging for a tab we expect to carry dispatch data. A discovered tab that
      // turns out to be empty is just a tab.
      if (group) warnings.push(`No data returned for tab "${tab}"`);
      continue;
    }
    const channel = heatmapColumnForTab(tab);

    // Units are attributed by SKU ID, so a tab needn't list the same products in the same
    // order as the rollup. Products get added to the rollup and the channel tabs at different
    // times — a tab missing a new SKU just has nothing for it yet. Demanding an exact match
    // used to drop a whole `other` tab the day a product was added.
    const tabSkuIds = rows
      .slice(FIRST_DATA_ROW)
      .map((r) => String(r?.[0] ?? '').trim())
      .filter((id) => id && !isTotalRow(id));
    if (!tabSkuIds.some((id) => knownSkuIds.has(id))) {
      // No rollup SKU at all: a summary or notes sheet, not a dispatch tab. Folding it into
      // `other` would silently invent units.
      if (group) warnings.push(`Tab "${tab}" has none of the ${DRP_TAB} SKUs — skipped`);
      continue;
    }
    const unknown = tabSkuIds.filter((id) => !knownSkuIds.has(id));
    if (unknown.length) {
      // Counted in the channel's totals, but there is no product row to show them on until the
      // SKU is added to the rollup.
      warnings.push(`Tab "${tab}" has SKUs missing from ${DRP_TAB}: ${unknown.join(', ')}`);
    }

    const header = rows[HEADER_ROW_OFFSET] ?? [];
    const totalCol = totalColumn(header);
    if (totalCol < 0) {
      if (group) warnings.push(`Tab "${tab}" has no "Total" column — skipped`);
      continue;
    }
    for (const spec of resolveColumns(header, totalCol + 1)) {
      let colSum = 0;
      // Kept alongside colSum so the month grid and the timeline can never disagree — they
      // are two reductions of the same single read.
      const perSku: { id: string; units: number }[] = [];
      for (let r = FIRST_DATA_ROW; r < rows.length; r++) {
        if (isTotalRow(String(rows[r]?.[0] ?? ''))) continue;
        const units = parseNum(rows[r]?.[spec.index]) ?? 0;
        if (!units) continue;
        colSum += units;
        const id = String(rows[r]?.[0] ?? '').trim();
        // A value on a row with no SKU ID still counts toward the tab total, but there is
        // nothing to attribute it to; the reconciliation delta is what surfaces it.
        if (id) perSku.push({ id, units });
      }
      if (!spec.iso) {
        if (colSum > 0) {
          warnings.push(
            `Tab "${tab}": column "${spec.header.replace(/\s+/g, ' ').trim()}" has ${colSum} units and no date anywhere to attribute to — dropped`,
          );
        }
        continue;
      }

      let slot = byDate.get(spec.iso);
      if (!slot) byDate.set(spec.iso, (slot = new Map()));
      slot.set(channel, (slot.get(channel) ?? 0) + colSum);
      channelTabTotals[channel] += colSum;

      // Undated columns inherited a neighbour's date above, so their units land in a month
      // here for free — the same attribution the daily series already makes.
      const monthKey = spec.iso.slice(0, 7);
      let bySku = byMonth.get(monthKey);
      if (!bySku) byMonth.set(monthKey, (bySku = new Map()));
      for (const { id, units } of perSku) {
        let cells = bySku.get(id);
        if (!cells) bySku.set(id, (cells = emptyColumnTotals()));
        cells[channel] += units;
      }

      if (!spec.dated) {
        const pointKey = `${spec.iso}|${channel}`;
        backfillByPoint[pointKey] = (backfillByPoint[pointKey] ?? 0) + colSum;
        backfillNotes.push({
          tab,
          channel,
          header: spec.header.replace(/\s+/g, ' ').trim(),
          units: colSum,
          attributedTo: spec.iso,
        });
      }
    }
  }

  const dates = [...byDate.keys()].sort();
  const daily: DailyPoint[] = dates.map((date) => {
    const point: DailyPoint = { date };
    const slot = byDate.get(date)!;
    for (const g of GROUPS) point[g.key] = slot.get(g.key) ?? 0;
    return point;
  });

  const todayIso = toIsoKey(new Date());
  // FBF carries future-dated planned dispatches; "last dispatch" must not report those.
  const lastDispatch = [...dates].reverse().find((d) => d <= todayIso) ?? null;

  const reconciliation: Reconciliation[] = GROUPS.map((g) => {
    const fromTabs = channelTabTotals[g.key];
    const allTime = columnTotals[g.key];
    return { channel: g.key as HeatmapColumnKey, fromTabs, allTime, delta: fromTabs - allTime };
  });

  for (const r of reconciliation) {
    if (r.delta !== 0) {
      warnings.push(
        `${GROUP_BY_KEY[r.channel as GroupKey].label}: tabs ${r.fromTabs} vs all-time ${r.allTime} (Δ ${r.delta})`,
      );
    }
  }

  // `other` reconciles only once every non-marketplace channel has a dated tab. Until then the
  // shortfall is expected, so it is reported rather than warned — it is the number that tells
  // you how much of `other` is still all-time-only.
  const otherFromTabs = channelTabTotals[OTHER_KEY];
  const otherAllTime = columnTotals[OTHER_KEY];
  reconciliation.push({
    channel: OTHER_KEY,
    fromTabs: otherFromTabs,
    allTime: otherAllTime,
    delta: otherFromTabs - otherAllTime,
  });

  const grandTotal = GROUPS.reduce((s, g) => s + columnTotals[g.key], 0);
  const scopes = buildScopes({
    skus,
    heatmapRows,
    columnTotals,
    byMonth,
    dates,
    lastDispatch,
    todayIso,
  });

  return {
    skus,
    dates,
    daily,
    backfillByPoint,
    backfillNotes,
    heatmapRows,
    columnTotals,
    channelTabTotals,
    grandTotal,
    lastDispatch,
    reconciliation,
    scopes,
    warnings,
  };
}

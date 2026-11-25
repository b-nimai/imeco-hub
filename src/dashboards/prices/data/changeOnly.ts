// Carrying change-only readings forward (see CHANGE_ONLY_MARKETPLACES in ./types).
//
// Meesho's rows are written only when a price or stock state changes, so a price that held for
// a week has ONE row, a week old. The database views assume a reading every hour: price_daily
// would have no row for the six quiet days, availability_stats would drop the listing once its
// row aged past 30 days, and a 7-day chart would draw nothing at all. These functions rebuild
// what an hourly reading WOULD have said — the last saved state held until the next one —
// from the raw change rows, which are few enough to fetch whole.

import type { AvailabilityRow, HistoryRow, PriceDailyRow } from './supabaseClient';

export interface ChangeRow {
  sku: string;
  marketplace: string;
  price: number | null;
  status: string;
  checked_at: string;
}

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;

/** YYYY-MM-DD in India time — the calendar price_daily groups by. */
export function istDay(t: number): string {
  return new Date(t + IST).toISOString().slice(0, 10);
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
}

const counts = (s: string) => s === 'ok' || s === 'out_of_stock';

function byListing(rows: ChangeRow[]): ChangeRow[][] {
  const groups = new Map<string, ChangeRow[]>();
  for (const r of rows) {
    const key = `${r.sku}:${r.marketplace}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const at = (r: ChangeRow) => Date.parse(r.checked_at);
  return [...groups.values()].map((g) => g.sort((a, b) => at(a) - at(b)));
}

/**
 * price_daily rows for change-only listings, one per day from `sinceDay` (or the listing's first
 * reading) through `today`. Each day sees the state carried in from the day before plus that
 * day's own changes, and counts as one reading — so a listing that sat in stock all week is
 * in stock on every one of those days, not just the day it was saved.
 */
export function dailyFromChanges(rows: ChangeRow[], sinceDay: string, today: string): PriceDailyRow[] {
  const out: PriceDailyRow[] = [];
  for (const list of byListing(rows)) {
    let i = 0;
    let carried: ChangeRow | null = null;
    const first = istDay(Date.parse(list[0].checked_at));
    for (let day = first < sinceDay ? sinceDay : first; day <= today; day = nextDay(day)) {
      while (i < list.length && istDay(Date.parse(list[i].checked_at)) < day) carried = list[i++];
      const seq: ChangeRow[] = carried ? [carried] : [];
      while (i < list.length && istDay(Date.parse(list[i].checked_at)) === day) seq.push(list[i++]);
      carried = seq[seq.length - 1] ?? carried;
      const end = seq[seq.length - 1];
      if (!end || !counts(end.status)) continue; // not listed that day
      const ok = seq.filter((r) => r.status === 'ok' && r.price != null).map((r) => r.price!);
      out.push({
        sku: end.sku,
        marketplace: end.marketplace,
        day,
        close_price: ok.length ? ok[ok.length - 1] : null,
        low_price: ok.length ? Math.min(...ok) : null,
        high_price: ok.length ? Math.max(...ok) : null,
        readings: 1,
        in_stock: end.status === 'ok' ? 1 : 0,
      });
    }
  }
  return out;
}

/**
 * availability_stats rows for change-only listings, sampling the carried state once a day for
 * the last 30 days. A listing whose newest row says it left the sheet has no row, as the view
 * gives none for a listing with no stock readings.
 */
export function availabilityFromChanges(rows: ChangeRow[], now: number): AvailabilityRow[] {
  const out: AvailabilityRow[] = [];
  const windowStart = now - 30 * DAY;
  for (const list of byListing(rows)) {
    if (!counts(list[list.length - 1].status)) continue;
    const stock = list.filter((r) => counts(r.status));
    const at = stock.map((r) => Date.parse(r.checked_at));
    const current = stock[stock.length - 1].status as 'ok' | 'out_of_stock';

    let checks7 = 0;
    let in7 = 0;
    let checks30 = 0;
    let in30 = 0;
    for (let k = 0; k < 30; k++) {
      const t = now - k * DAY;
      let j = at.length - 1;
      while (j >= 0 && at[j] > t) j -= 1;
      if (j < 0) break; // before the listing's first reading
      const ok = stock[j].status === 'ok';
      checks30 += 1;
      in30 += +ok;
      if (k < 7) {
        checks7 += 1;
        in7 += +ok;
      }
    }

    let flip = stock.length - 1;
    while (flip > 0 && stock[flip - 1].status === current) flip -= 1;
    const since = at[flip];
    // The previous state held until `since`, so it was in force inside the window whenever the
    // flip happened inside it — however old the row that started it.
    const otherInWindow = flip > 0 && since > windowStart;
    out.push({
      sku: list[0].sku,
      marketplace: list[0].marketplace,
      status_now: current,
      checks_7d: checks7,
      in_stock_7d: in7,
      checks_30d: checks30,
      in_stock_30d: in30,
      status_since: new Date(Math.max(since, windowStart)).toISOString(),
      unchanged_30d: !otherInWindow,
    });
  }
  return out;
}

/**
 * One listing's history for a chart window: the reading in force when the window opened
 * (`before`, moved to the window's start), the changes inside it, and the current state
 * repeated at `now` so the line runs to the right edge instead of stopping at the last change.
 */
export function padHistory(
  inWindow: HistoryRow[],
  before: HistoryRow | null,
  since: string,
  now: string,
): HistoryRow[] {
  const rows = before ? [{ ...before, checked_at: since }, ...inWindow] : [...inWindow];
  const last = rows[rows.length - 1];
  if (last && Date.parse(last.checked_at) < Date.parse(now)) rows.push({ ...last, checked_at: now });
  return rows;
}

import { describe, expect, it } from 'vitest';

import { availabilityFromChanges, dailyFromChanges, istDay, padHistory, type ChangeRow } from './changeOnly';

const DAY = 86_400_000;
// Noon India time, so a row never straddles the IST/UTC date boundary.
const at = (day: string) => `${day}T06:30:00.000Z`;
const row = (day: string, price: number | null, status = 'ok', sku = 'A'): ChangeRow => ({
  sku,
  marketplace: 'meesho',
  price,
  status,
  checked_at: at(day),
});

describe('istDay', () => {
  it('uses the India calendar, not UTC', () => {
    expect(istDay(Date.parse('2026-11-24T19:00:00Z'))).toBe('2026-11-25');
    expect(istDay(Date.parse('2026-11-24T18:00:00Z'))).toBe('2026-11-24');
  });
});

describe('dailyFromChanges', () => {
  it('carries a price through the quiet days between changes', () => {
    const days = dailyFromChanges([row('2026-11-20', 100), row('2026-11-23', 90)], '2026-11-01', '2026-11-25');
    expect(days.map((d) => [d.day, d.close_price])).toEqual([
      ['2026-11-20', 100],
      ['2026-11-21', 100],
      ['2026-11-22', 100],
      ['2026-11-23', 90],
      ['2026-11-24', 90],
      ['2026-11-25', 90],
    ]);
    // The day it changed saw both prices.
    expect(days[3]).toMatchObject({ low_price: 90, high_price: 100, readings: 1, in_stock: 1 });
  });

  it('starts at the window, carrying in a price saved before it', () => {
    const days = dailyFromChanges([row('2026-10-01', 100)], '2026-11-24', '2026-11-25');
    expect(days.map((d) => [d.day, d.close_price])).toEqual([
      ['2026-11-24', 100],
      ['2026-11-25', 100],
    ]);
  });

  it('counts an out-of-stock stretch as readings without stock, and drops delisted days', () => {
    const days = dailyFromChanges(
      [row('2026-11-20', 100), row('2026-11-21', 100, 'out_of_stock'), row('2026-11-22', null, 'not_listed')],
      '2026-11-01',
      '2026-11-23',
    );
    expect(days.map((d) => [d.day, d.in_stock, d.close_price])).toEqual([
      ['2026-11-20', 1, 100],
      ['2026-11-21', 0, 100], // the carried-in ok reading is still that day's last live price
    ]);
  });

  it('keeps listings apart', () => {
    const days = dailyFromChanges([row('2026-11-25', 100), row('2026-11-25', 50, 'ok', 'B')], '2026-11-25', '2026-11-25');
    expect(days.map((d) => [d.sku, d.close_price]).sort()).toEqual([
      ['A', 100],
      ['B', 50],
    ]);
  });
});

describe('availabilityFromChanges', () => {
  const now = Date.parse(at('2026-11-25'));

  it('counts days in stock, not saved rows', () => {
    const [a] = availabilityFromChanges(
      [row('2026-10-01', 100), row('2026-11-22', 100, 'out_of_stock')],
      now,
    );
    expect(a).toMatchObject({ status_now: 'out_of_stock', checks_7d: 7, in_stock_7d: 3, checks_30d: 30 });
    expect(a.in_stock_30d).toBe(26);
    expect(a.status_since).toBe(at('2026-11-22'));
    expect(a.unchanged_30d).toBe(false);
  });

  it('says unchanged when the state has held all month', () => {
    const [a] = availabilityFromChanges([row('2026-09-01', 100)], now);
    expect(a.unchanged_30d).toBe(true);
    expect(Date.parse(a.status_since)).toBe(now - 30 * DAY);
    expect(a.in_stock_30d).toBe(30);
  });

  it('gives nothing for a listing that left the sheet', () => {
    expect(availabilityFromChanges([row('2026-11-01', 100), row('2026-11-20', null, 'not_listed')], now)).toEqual([]);
  });
});

describe('padHistory', () => {
  const h = (t: string, price: number) => ({ marketplace: 'meesho', price, status: 'ok', checked_at: t });

  it('opens the window on the price already in force and runs the line to now', () => {
    const out = padHistory([h('2026-11-20T00:00:00Z', 90)], h('2026-10-01T00:00:00Z', 100), '2026-11-18T00:00:00Z', '2026-11-25T00:00:00Z');
    expect(out.map((r) => [r.checked_at, r.price])).toEqual([
      ['2026-11-18T00:00:00Z', 100],
      ['2026-11-20T00:00:00Z', 90],
      ['2026-11-25T00:00:00Z', 90],
    ]);
  });

  it('draws a flat line through a window with no change', () => {
    const out = padHistory([], h('2026-10-01T00:00:00Z', 100), '2026-11-18T00:00:00Z', '2026-11-25T00:00:00Z');
    expect(out.map((r) => r.price)).toEqual([100, 100]);
  });

  it('draws nothing for a listing never saved', () => {
    expect(padHistory([], null, '2026-11-18T00:00:00Z', '2026-11-25T00:00:00Z')).toEqual([]);
  });
});

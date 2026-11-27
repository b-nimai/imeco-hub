import { describe, it, expect } from 'vitest';
import { parseSheet } from './sheetsApi.js';

const META_NOV = { month: 10, year: 2026, sortKey: 2026 * 12 + 10 };

describe('parseSheet Myntra consolidation', () => {
  it('merges Myntra PPMP and Myntra SJIT into Myntra (incl. SJIT)', () => {
    const rows = [
      ['Target', '100000', '500000', '0', '600000'],
      ['Actual', '80000', '180000', '98200', '358200'],
      ['Date', 'Blinkit', 'Myntra PPMP', 'Myntra SJIT', 'Total'],
      ['2026-11-01', '50000', '100000', '40000', '190000'],
      ['2026-11-02', '30000', '80000', '58200', '168200'],
    ];

    const parsed = parseSheet(rows, META_NOV);
    expect(parsed).not.toBeNull();
    expect(parsed.channels.map((c) => c.name)).toEqual(['Blinkit', 'Myntra (incl. SJIT)']);

    const myntra = parsed.channels.find((c) => c.name === 'Myntra (incl. SJIT)');
    expect(myntra.target).toBe(500000);
    expect(myntra.actual).toBe(278200);
    expect(myntra.pct).toBe(56);
    expect(myntra.daily).toEqual([140000, 138200]);
  });

  it('merges Myntra (incl. SJIT), Myntra PPMP, and Myntra SJIT into one channel', () => {
    const rows = [
      ['Target', '200000', '300000', '100000', '600000'],
      ['Actual', '100000', '150000', '50000', '300000'],
      ['Date', 'Myntra (incl. SJIT)', 'Myntra PPMP', 'Myntra SJIT', 'Total'],
      ['2026-11-01', '100000', '150000', '50000', '300000'],
    ];

    const parsed = parseSheet(rows, META_NOV);
    expect(parsed.channels).toHaveLength(1);
    expect(parsed.channels[0].name).toBe('Myntra (incl. SJIT)');
    expect(parsed.channels[0].target).toBe(600000);
    expect(parsed.channels[0].actual).toBe(300000);
    expect(parsed.channels[0].pct).toBe(50);
    expect(parsed.channels[0].daily).toEqual([300000]);
  });

  it('renames a lone Myntra variant to Myntra (incl. SJIT)', () => {
    const rows = [
      ['Target', '300000', '300000'],
      ['Actual', '150000', '150000'],
      ['Date', 'Myntra PPMP', 'Total'],
      ['2026-11-01', '150000', '150000'],
    ];

    const parsed = parseSheet(rows, META_NOV);
    expect(parsed.channels).toHaveLength(1);
    expect(parsed.channels[0].name).toBe('Myntra (incl. SJIT)');
    expect(parsed.channels[0].actual).toBe(150000);
  });
});

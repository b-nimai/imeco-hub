import { describe, expect, it } from 'vitest';

import { resolveLayout, toEan } from './billingApi';

describe('resolveLayout', () => {
  // The billing sheet's real header row (Billing Dashboard › Sheet1).
  const header = [
    'Item Image',
    'SKU',
    'Product Name',
    'Brand',
    'RK',
    'Clicktech',
    'Blinkit',
    'Blinkit (New SP)',
    'Swiggy Instamart',
    'Firstclub',
    'EAN',
  ];

  it('takes Product Name as the name, not the SKU column', () => {
    const layout = resolveLayout(header);
    expect(layout.imageCol).toBe(0);
    expect(layout.skuCol).toBe(1);
    expect(layout.nameCol).toBe(2);
    expect(layout.brandCol).toBe(3);
    expect(layout.eanCol).toBe(10);
  });

  it('keeps names and identifiers out of the channels', () => {
    expect(resolveLayout(header).channels.map((c) => c.name)).toEqual([
      'RK',
      'Clicktech',
      'Blinkit',
      'Blinkit (New SP)',
      'Swiggy Instamart',
      'Firstclub',
    ]);
  });

  it('still works on the original layout with no SKU column', () => {
    const layout = resolveLayout(['Item Image', 'Product Name', 'Brand', 'RK', 'Blinkit']);
    expect(layout.skuCol).toBe(-1);
    expect(layout.eanCol).toBe(-1);
    expect(layout.nameCol).toBe(1);
    expect(layout.channels.map((c) => c.name)).toEqual(['RK', 'Blinkit']);
  });
});

describe('toEan', () => {
  it('prints a numeric EAN as plain digits', () => {
    expect(toEan(8906200791477)).toBe('8906200791477');
  });
  it('keeps a text EAN and drops spaces', () => {
    expect(toEan(' 8906 2007 91477 ')).toBe('8906200791477');
  });
  it('is empty for a blank cell', () => {
    expect(toEan(null)).toBe('');
    expect(toEan('')).toBe('');
    expect(toEan(0)).toBe('');
  });
});

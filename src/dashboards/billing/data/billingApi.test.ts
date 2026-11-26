import { describe, expect, it } from 'vitest';

import { resolveLayout } from './billingApi';

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
    expect(layout.nameCol).toBe(1);
    expect(layout.channels.map((c) => c.name)).toEqual(['RK', 'Blinkit']);
  });
});

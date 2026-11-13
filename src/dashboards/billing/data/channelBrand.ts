// Marketplace identity colours for the channel columns.
//
// Each channel header wears its marketplace's own colours, and the column below it gets a
// faint wash of the same hue so the eye can track a channel down a long grid without
// re-reading the header.
//
// Keys are matched loosely (lowercased, non-alphanumerics stripped) so "Swiggy Instamart",
// "swiggy-instamart", and "SWIGGY INSTAMART" all resolve to the same brand.

interface Colours {
  bg: string;
  fg: string;
}

export interface ChannelBrand extends Colours {
  tint: string;
  edge: string;
}

const BRANDS: Record<string, Colours> = {
  rk: { bg: '#ffffff', fg: '#000000' }, // black on white, Amazon-logo style
  clicktech: { bg: '#ffffff', fg: '#000000' },
  blinkit: { bg: '#f8cb46', fg: '#000000' }, // black on brand yellow
  swiggyinstamart: { bg: '#fc8019', fg: '#ffffff' },
  instamart: { bg: '#fc8019', fg: '#ffffff' },
  swiggy: { bg: '#fc8019', fg: '#ffffff' },
  firstclub: { bg: '#16a34a', fg: '#ffffff' },
  zepto: { bg: '#3d1d72', fg: '#ffffff' },
  amazon: { bg: '#ff9900', fg: '#111827' },
  amazonb2b: { bg: '#232f3e', fg: '#ff9900' },
  flipkart: { bg: '#2874f0', fg: '#ffffff' },
  meesho: { bg: '#f43397', fg: '#ffffff' },
  myntra: { bg: '#ff3f6c', fg: '#ffffff' },
  jiomart: { bg: '#0f3cc9', fg: '#ffffff' },
  bigbasket: { bg: '#84c225', fg: '#111827' },
  dmart: { bg: '#008752', fg: '#ffffff' },
  other: { bg: '#475569', fg: '#e2e8f0' },
};

// Channels the sheet adds later that aren't in the map still get a stable, distinct colour
// rather than all collapsing to one grey.
const FALLBACK: Colours[] = [
  { bg: '#0ea5e9', fg: '#062033' },
  { bg: '#14b8a6', fg: '#052e2b' },
  { bg: '#a855f7', fg: '#ffffff' },
  { bg: '#eab308', fg: '#1c1917' },
  { bg: '#ef4444', fg: '#ffffff' },
  { bg: '#64748b', fg: '#ffffff' },
];

function key(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return [r, g, b];
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function brandFor(name: string, index = 0): ChannelBrand {
  const brand = BRANDS[key(name)] ?? FALLBACK[index % FALLBACK.length];
  // A near-black brand would wash the column in something invisible against the dark page,
  // so tint from the foreground colour instead whenever the background is dark.
  const tintSource = luminance(brand.bg) < 0.2 ? brand.fg : brand.bg;
  const [r, g, b] = toRgb(tintSource);
  return {
    ...brand,
    tint: `rgba(${r}, ${g}, ${b}, 0.06)`,
    edge: `rgba(${r}, ${g}, ${b}, 0.22)`,
  };
}

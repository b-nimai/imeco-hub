import { useMemo, useState } from 'react';

import goodHabbitLogo from '@/dashboards/billing/assets/Good_habbit_Logo.png';
import imecoLogo from '@/dashboards/billing/assets/imeco_logo_black.png';
import { ProductImage } from '@/dashboards/billing/components/ProductImage';
import { ProductModal } from '@/dashboards/billing/components/ProductModal';
import type { BillingProduct } from '@/dashboards/billing/data/billingApi';
import { brandFor } from '@/dashboards/billing/data/channelBrand';
import { formatFull } from '@/dashboards/billing/data/format';

// Sheet brand values -> house logo. Matched loosely (lowercased, non-alphanumerics
// stripped) so "Good Habbit", "GOOD HABBIT" and "good-habbit" all land on the same file.
// Both logos are dark artwork on transparency, so they ride on a white chip to stay
// readable against the night background. A brand with no logo still gets a text chip.
const BRAND_LOGOS: Record<string, string> = {
  imeco: imecoLogo,
  goodhabbit: goodHabbitLogo,
  goodhabit: goodHabbitLogo,
};

function logoFor(name: string): string | null {
  return BRAND_LOGOS[name.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
}

const NAME_KEY = '__name';

interface Props {
  products: BillingProduct[];
  channels: string[];
  brands?: string[];
}

// The grid mirrors the sheet exactly: Product Image, Product Name, then every channel
// column in the order the sheet's header row declares them. No derived columns and no
// totals row — what you see here is what is in the sheet.
//
// The sheet's Brand column is the one exception: it holds no figure, so instead of a
// column it becomes the toggle row beside the Product header.
export function BillingGrid({ products, channels, brands = [] }: Props) {
  const [query, setQuery] = useState('');
  // Empty = no brand filter, i.e. every product shows.
  const [activeBrands, setActiveBrands] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string | null>(null); // null = sheet order
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<BillingProduct | null>(null);

  // Resolved once per channel list rather than per cell.
  const channelBrands = useMemo(
    () => Object.fromEntries(channels.map((ch, i) => [ch, brandFor(ch, i)])),
    [channels],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byBrand = activeBrands.length
      ? products.filter((p) => activeBrands.includes(p.brand))
      : products;
    const filtered = q
      ? byBrand.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.ean.includes(q),
        )
      : byBrand;
    if (!sortKey) return filtered; // preserve the sheet's own row order
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === NAME_KEY) {
        return a.name.localeCompare(b.name, undefined, { numeric: true }) * dir;
      }
      return ((a.values[sortKey] || 0) - (b.values[sortKey] || 0)) * dir;
    });
  }, [products, query, activeBrands, sortKey, sortDir]);

  function toggleBrand(name: string) {
    setActiveBrands((prev) =>
      prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name],
    );
  }

  function toggleSort(key: string) {
    if (key !== sortKey) {
      setSortKey(key);
      setSortDir(key === NAME_KEY ? 'asc' : 'desc');
      return;
    }
    // Third click on the same header returns to the sheet's original order.
    if (sortDir === 'desc') setSortDir('asc');
    else setSortKey(null);
  }

  const arrow = (key: string) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div className="billing-card flex h-full min-h-0 flex-col rounded-xl">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-[#1a2d45] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-bold tracking-widest text-[#94a3b8] uppercase">
            Product Billing
          </span>
          <span className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-2 py-1 text-[11px] font-black tracking-widest text-[#22c55e] uppercase">
            All figures inclusive of GST
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-semibold text-[#64748b]">
            {rows.length} of {products.length} products
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product…"
            className="w-52 rounded-md border border-[#1a2d45] bg-[#0d1f35] px-2.5 py-1.5 text-[13px] text-[#e2e8f0] placeholder:text-[#475569] focus:border-[#22c55e]/50 focus:outline-hidden"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse">
          {/* Explicit widths: the channels split the remaining width evenly, so the grid
              stays balanced at any channel count. */}
          <colgroup>
            <col style={{ width: 74 }} />
            <col style={{ width: '30%' }} />
            {channels.map((ch) => (
              <col key={ch} style={{ width: `${70 / channels.length}%` }} />
            ))}
          </colgroup>

          <thead className="sticky top-0 z-10 bg-[#0a1628]">
            <tr className="border-b border-[#1a2d45]">
              <th className="bg-[#0a1628] px-3 py-3" />
              <th className="bg-[#0a1628] px-3 py-3 text-left">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="cursor-pointer text-[13px] font-bold tracking-[0.15em] text-[#94a3b8] uppercase transition-colors select-none hover:text-white"
                    onClick={() => toggleSort(NAME_KEY)}
                  >
                    Product{arrow(NAME_KEY)}
                  </span>
                  {/* Brand toggles. Nothing selected means no filter at all, which is why
                      the "all off" state reads as every brand lit rather than an empty grid. */}
                  <div className="flex flex-1 items-center justify-end gap-3">
                    {brands.map((b) => {
                      const on = activeBrands.length === 0 || activeBrands.includes(b);
                      const logo = logoFor(b);
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => toggleBrand(b)}
                          aria-pressed={activeBrands.includes(b)}
                          title={`Show only ${b}`}
                          className={`rounded-md border transition-all ${
                            logo
                              ? 'bg-white px-2 py-1'
                              : 'px-2 py-0.5 text-[10px] leading-none font-black tracking-[0.12em] uppercase'
                          } ${
                            on
                              ? 'border-[#22c55e]/60 opacity-100'
                              : logo
                                ? 'border-[#1a2d45] opacity-35 grayscale hover:opacity-60'
                                : 'border-[#1a2d45] bg-[#0d1f35] text-[#475569] hover:text-[#94a3b8]'
                          }`}
                        >
                          {logo ? <img src={logo} alt={b} className="block h-4 w-auto" /> : b}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </th>
              {channels.map((ch) => {
                const brand = channelBrands[ch];
                return (
                  <th
                    key={ch}
                    // Wraps rather than nowrap: the columns are fixed-width, so a long channel
                    // name ("Blinkit (New SP)", "Swiggy Instamart") on one line spilled over its
                    // neighbours' headers.
                    className="cursor-pointer px-2 py-2 text-center text-[13px] leading-tight font-black tracking-[0.08em] break-words uppercase transition-opacity select-none hover:opacity-85"
                    // RK and Clicktech are both white, so without a divider their headers
                    // would read as one continuous block instead of two columns.
                    style={{
                      background: brand.bg,
                      color: brand.fg,
                      borderLeft: '2px solid #0a1628',
                    }}
                    onClick={() => toggleSort(ch)}
                  >
                    {ch}
                    {arrow(ch)}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((p, i) => (
              <tr
                key={`${p.sku || p.name}-${i}`}
                className="border-b border-[#1a2d45]/50 transition-colors hover:bg-[#0d1f35]/70"
              >
                <td className="px-3 py-2">
                  <ProductImage src={p.image} name={p.name} onClick={() => setSelected(p)} />
                </td>
                <td
                  className="px-3 py-2"
                  title={[p.name, p.sku && `SKU ${p.sku}`, p.ean && `EAN ${p.ean}`]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  <div className="truncate text-[15px] font-semibold text-[#e2e8f0]">{p.name}</div>
                  {/* SKU, then the EAN to its right. Either may be missing in the sheet. */}
                  {((p.sku && p.sku !== p.name) || p.ean) && (
                    <div className="flex min-w-0 items-center gap-3 text-[11px] font-bold tracking-wider text-[#64748b]">
                      {p.sku && p.sku !== p.name && <span className="truncate">{p.sku}</span>}
                      {p.ean && (
                        <span className="flex-none tabular-nums">
                          <span className="text-[#475569]">EAN </span>
                          {p.ean}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                {channels.map((ch) => {
                  const v = p.values[ch] || 0;
                  return (
                    <td
                      key={ch}
                      className="px-3 py-2 text-center text-[15px] font-bold tabular-nums"
                      style={{
                        background: channelBrands[ch].tint,
                        color: v > 0 ? '#e2e8f0' : '#334155',
                      }}
                    >
                      {v > 0 ? formatFull(v) : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={channels.length + 2}
                  className="px-3 py-10 text-center text-[14px] text-[#475569]"
                >
                  No products match “{query}”
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <ProductModal product={selected} channels={channels} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

import { useEffect } from 'react';

import type { BillingProduct } from '@/dashboards/billing/data/billingApi';
import { brandFor } from '@/dashboards/billing/data/channelBrand';
import { formatFull } from '@/dashboards/billing/data/format';

interface Props {
  product: BillingProduct;
  channels: string[];
  onClose: () => void;
}

// Centred lightbox for a product: the full-resolution image plus that product's row of
// channel figures, so clicking a tile answers "what am I looking at, and how is it doing"
// in one place.
export function ProductModal({ product, channels, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Stop the grid behind the overlay from scrolling under the pointer.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(3, 8, 17, 0.82)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div
        className="billing-card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#1a2d45] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-start justify-between gap-4 border-b border-[#1a2d45] px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-lg leading-tight font-black text-white" title={product.name}>
              {product.name}
            </div>
            <div className="mt-1 text-[11px] font-bold tracking-widest text-[#22c55e] uppercase">
              Inclusive of GST
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 flex-none rounded-lg border border-[#1a2d45] text-lg leading-none text-[#94a3b8] transition-colors hover:border-[#22c55e]/50 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-auto p-5">
          {product.imageFull ? (
            <img
              src={product.imageFull}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="max-h-[52vh] w-auto max-w-full rounded-xl bg-white object-contain"
            />
          ) : (
            <div className="flex h-48 w-full items-center justify-center rounded-xl border border-[#1a2d45] bg-[#111c2e] text-sm text-[#475569]">
              No image in the sheet for this product
            </div>
          )}

          <div
            className="grid w-full gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
          >
            {channels.map((ch, i) => {
              const brand = brandFor(ch, i);
              const v = product.values[ch] || 0;
              return (
                <div
                  key={ch}
                  className="rounded-lg border px-3 py-2"
                  style={{ background: brand.tint, borderColor: brand.edge }}
                >
                  <div
                    className="truncate text-[10px] font-black tracking-widest uppercase"
                    style={{ color: brand.bg === '#000000' ? brand.fg : brand.bg }}
                  >
                    {ch}
                  </div>
                  <div
                    className="mt-0.5 text-lg font-black tabular-nums"
                    style={{ color: v > 0 ? '#f1f5f9' : '#334155' }}
                  >
                    {v > 0 ? formatFull(v) : '·'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';

interface Props {
  src: string | null;
  name: string;
  size?: number;
  onClick?: () => void;
}

// Product thumbnails come from the sheet's image column as Google Drive links, which
// billingApi rewrites to Drive's thumbnail endpoint. Drive occasionally refuses to serve
// one (permissions, rate limits), so every image falls back to a lettered tile rather
// than leaving a broken-image gap that would break the row rhythm.
export function ProductImage({ src, name, size = 46, onClick }: Props) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  const clickable = Boolean(onClick);

  const shared =
    'rounded-lg shrink-0 border border-[#1a2d45] ' +
    (clickable
      ? 'cursor-zoom-in transition-transform hover:scale-110 hover:border-[#22c55e]/60 focus:outline-hidden focus:ring-2 focus:ring-[#22c55e]/50'
      : '');

  const inner =
    !src || failed ? (
      <div
        style={box}
        className={`${shared} flex items-center justify-center bg-[#111c2e] text-[13px] font-black text-[#475569]`}
      >
        {(name || '?').charAt(0).toUpperCase()}
      </div>
    ) : (
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={box}
        className={`${shared} bg-white/90 object-contain`}
      />
    );

  if (!clickable) return inner;

  return (
    <button type="button" onClick={onClick} title={`View ${name}`} className="block">
      {inner}
    </button>
  );
}

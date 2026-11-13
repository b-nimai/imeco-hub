import { formatINR, formatCompactINR } from '../../data/salesData.js';
import {
  INK, CARD, BORDER, FG, MUTED, HIGH, pctFill, RAMP_GRADIENT, RAMP_LEGEND,
} from './heatScale.js';

const MONO = 'font-mono font-bold tabular-nums';
const EYEBROW = 'text-[11px] font-bold tracking-[0.15em] uppercase';

// Trend of avg revenue/day per month (so a part-done month isn't read as a drop).
function Trend({ values }) {
  const pts = values.filter((v) => v !== null);
  if (pts.length < 2) return <span className="text-[9px]" style={{ color: MUTED }}>—</span>;
  const W = 64, H = 16;
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const coords = pts.map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${(H - 1 - ((v - min) / span) * (H - 2)).toFixed(1)}`);
  const lastY = coords[coords.length - 1].split(',')[1];
  const up = pts[pts.length - 1] >= pts[pts.length - 2];
  const color = up ? HIGH : '#f8696b';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ overflow: 'visible' }}>
      <polyline points={coords.join(' ')} fill="none" stroke={FG} strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={W} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

// Channel × month heatmap, drawn like the outbound tracker's grid: solid pastel cells with
// dark ink. Each cell is that channel's revenue for the month, coloured by how it did against
// its own monthly target (pace-adjusted for the running month).
export default function FYChannelMatrix({ scope, videoSlot }) {
  const { channelData, months, currentMTD } = scope;
  const monthByKey = new Map(months.map((m) => [m.key, m]));
  const channels = [...channelData].sort((a, b) => b.actual - a.actual);
  const topActual = channels[0]?.actual || 1;
  const cols = `minmax(150px,1.5fr) 96px repeat(${months.length}, minmax(56px,1fr)) 76px 92px minmax(90px,1fr) 72px`;

  const cellPct = (entry) => {
    const m = monthByKey.get(entry.key);
    const due = m?.partial ? entry.target * (m.daysDone / m.daysInMonth) : entry.target;
    return due > 0 ? (entry.actual / due) * 100 : null;
  };
  const fyPct = (currentMTD / Math.max(1, scope.currentTarget)) * 100;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-2 flex-none">
        <span className={EYEBROW} style={{ color: MUTED }}>
          Channel × Month — {scope.currentMonthLabel} ({channels.length} channels)
        </span>
        <div className="flex-1 h-px" style={{ background: BORDER }} />
        <div className="flex items-center gap-2 text-[11px] font-bold" style={{ color: MUTED }}>
          <span>Cell = revenue · colour = vs monthly target</span>
          <span className="flex flex-col gap-0.5 w-[150px]">
            <span className="h-2 rounded-sm" style={{ background: RAMP_GRADIENT }} />
            <span className="flex justify-between text-[9px] leading-none">
              {RAMP_LEGEND.map((l) => <span key={l}>{l}</span>)}
            </span>
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {/* Opaque panel — the keep-awake video sits behind it (z-index -10) */}
        <div
          className="h-full rounded-xl flex flex-col overflow-hidden p-3"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}
        >
          {/* Header row */}
          <div
            className={`grid items-center gap-[2px] pb-1.5 flex-none ${EYEBROW}`}
            style={{ gridTemplateColumns: cols, color: MUTED }}
          >
            <span className="pl-2">Channel</span>
            <span className="text-right pr-2">FY Total</span>
            {months.map((m) => (
              <span key={m.key} className="text-center" style={{ color: m.partial ? FG : undefined }}>
                {m.label}{m.partial ? '·MTD' : ''}
              </span>
            ))}
            <span className="text-right pr-1">Target</span>
            <span className="text-center">Ach · Pace</span>
            <span className="pl-2">Share</span>
            <span className="text-center">Trend</span>
          </div>

          {/* All-channels totals — welded under the header like the tracker's. The underline
              is what stops it reading as just another channel. */}
          <div
            className="grid items-center gap-[2px] py-1.5 flex-none border-b-2"
            style={{ gridTemplateColumns: cols, borderColor: 'rgba(34,197,94,0.4)', color: FG }}
          >
            <span className={`${EYEBROW} pl-2`}>All channels</span>
            <span className={`${MONO} text-right pr-2 text-[15px]`}>{formatINR(currentMTD)}</span>
            {months.map((m) => (
              <span key={m.key} className={`${MONO} text-center text-[14px]`}>
                {formatCompactINR(m.actual)}
              </span>
            ))}
            <span className={`${MONO} text-right pr-1 text-[12px]`} style={{ color: MUTED }}>
              {formatINR(scope.currentTarget)}
            </span>
            <span className="flex justify-center">
              <span
                className={`${MONO} text-[11px] px-1.5 py-0.5 rounded-[3px]`}
                style={{ background: pctFill(fyPct), color: INK }}
              >
                {fyPct.toFixed(1)}%
              </span>
            </span>
            <span className={`${MONO} pl-2 text-[11px]`}>100%</span>
            <span />
          </div>

          {/* Channel rows */}
          <div className="flex-1 min-h-0 flex flex-col gap-[2px] pt-[2px] overflow-y-auto">
            {channels.map((ch) => {
              const byKey = new Map((ch.monthly || []).map((e) => [e.key, e]));
              const share = currentMTD > 0 ? (ch.actual / currentMTD) * 100 : 0;
              const trend = months.map((m) => {
                const e = byKey.get(m.key);
                return e && m.daysDone > 0 ? e.actual / m.daysDone : null;
              });
              return (
                <div
                  key={ch.name}
                  className="grid items-stretch gap-[2px] flex-1 min-h-[20px] max-h-[34px]"
                  style={{ gridTemplateColumns: cols }}
                >
                  <span className="flex items-center min-w-0 pl-2 text-[13px] font-semibold truncate" style={{ color: FG }}>
                    <span className="truncate">{ch.name}</span>
                  </span>
                  <span className={`${MONO} flex items-center justify-end pr-2 text-[13px]`} style={{ color: FG }}>
                    {formatINR(ch.actual)}
                  </span>

                  {months.map((m) => {
                    const e = byKey.get(m.key);
                    if (!e || (e.actual === 0 && e.target === 0)) {
                      return (
                        <span
                          key={m.key}
                          className="flex items-center justify-center rounded-[3px] text-[12px]"
                          style={{ color: 'rgba(161,161,170,0.6)', boxShadow: `inset 0 0 0 1px ${BORDER}` }}
                        >
                          ·
                        </span>
                      );
                    }
                    const pct = cellPct(e);
                    return (
                      <span
                        key={m.key}
                        className={`${MONO} flex items-center justify-center rounded-[3px] text-[13px]`}
                        style={{ background: pctFill(pct), color: INK }}
                        title={`${ch.name} · ${m.label}: ${formatINR(e.actual)} of ${formatINR(e.target)}${pct !== null ? ` (${Math.round(pct)}%${m.partial ? ' of due' : ''})` : ''}`}
                      >
                        {formatCompactINR(e.actual)}
                      </span>
                    );
                  })}

                  <span className={`${MONO} flex items-center justify-end pr-1 text-[11px]`} style={{ color: MUTED }}>
                    {ch.target > 0 ? formatINR(ch.target) : '—'}
                  </span>
                  <span className={`${MONO} flex items-center justify-center gap-1 text-[11px]`}>
                    <span style={{ color: FG }}>{ch.target > 0 ? `${ch.pct}%` : '—'}</span>
                    <span
                      className="px-1 py-px rounded-[3px]"
                      style={{ background: pctFill(ch.pacePct), color: INK }}
                    >
                      {ch.pacePct >= 999 ? 'NEW' : `${ch.pacePct}%`}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 pl-2">
                    <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: BORDER }}>
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(ch.actual / topActual) * 100}%`, background: pctFill(ch.pacePct) }}
                      />
                    </span>
                    <span className={`${MONO} text-[10px] w-9 text-right`} style={{ color: FG }}>
                      {share >= 1 ? share.toFixed(0) : share.toFixed(1)}%
                    </span>
                  </span>
                  <span className="flex items-center justify-center">
                    <Trend values={trend} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {videoSlot && (
          <div
            className="absolute bottom-0 right-0 hidden lg:block"
            style={{
              width: 150,
              height: 84,
              borderRadius: 8,
              overflow: 'hidden',
              opacity: 0.85,
              zIndex: -10,
            }}
          >
            {videoSlot}
          </div>
        )}
      </div>
    </div>
  );
}

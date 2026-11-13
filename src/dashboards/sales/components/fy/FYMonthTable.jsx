import { formatINR } from '../../data/salesData.js';
import { INK, BORDER, FG, MUTED, HIGH, LOW, pctFill, panelStyle } from './heatScale.js';

const COLS = '64px 1fr 1fr 1.3fr 64px 70px';

// Up to this many months the rows use the roomy layout; beyond it (Nov → Mar) they
// switch to a compact layout so all 12 months still fit in the same card.
const ROOMY_MAX = 7;

// Month-by-month scorecard: actual vs target, achievement, growth (daily-average
// based, so a part-done month compares fairly) and average per day.
export default function FYMonthTable({ months, fyActual, fyTarget, daysDone }) {
  const rows = months.map((m, i) => {
    const avg = m.daysDone > 0 ? m.actual / m.daysDone : 0;
    const prev = months[i - 1];
    const prevAvg = prev && prev.daysDone > 0 ? prev.actual / prev.daysDone : null;
    const mom = prevAvg ? ((avg - prevAvg) / prevAvg) * 100 : null;
    const ach = m.target > 0 ? (m.actual / m.target) * 100 : 0;
    // Part-done month: colour by pace against the target due so far, not the full month
    const due = m.partial ? m.target * (m.daysDone / m.daysInMonth) : m.target;
    const pace = due > 0 ? (m.actual / due) * 100 : 0;
    return { ...m, avg, mom, ach, pace };
  });
  const fyAch = fyTarget > 0 ? (fyActual / fyTarget) * 100 : 0;
  const compact = rows.length > ROOMY_MAX;
  const rowText = compact ? 'text-[11px]' : 'text-[12px]';

  return (
    <div
      className={`rounded-xl h-full flex flex-col ${compact ? 'px-4 py-2.5' : 'p-4'}`}
      style={panelStyle}
    >
      <div className={`flex items-center justify-between ${compact ? 'mb-1' : 'mb-2'}`}>
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase" style={{ color: MUTED }}>
          Month Scorecard
        </span>
        <span className="text-[10px]" style={{ color: MUTED }}>Growth = avg/day vs previous month</span>
      </div>

      <div
        className="grid text-[9px] font-bold tracking-[0.15em] uppercase pb-1 border-b"
        style={{ gridTemplateColumns: COLS, color: MUTED, borderColor: BORDER }}
      >
        <span>Month</span>
        <span className="text-right">Actual</span>
        <span className="text-right">Target</span>
        <span className="pl-3">Achieved</span>
        <span className="text-right">Growth</span>
        <span className="text-right">Avg/Day</span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {rows.map((r) => {
          const fill = pctFill(r.pace);
          return (
            <div
              key={r.key}
              className={`grid items-center flex-1 min-h-0 ${rowText} leading-none border-b font-mono tabular-nums`}
              style={{ gridTemplateColumns: COLS, borderColor: 'rgba(42,42,42,0.6)' }}
            >
              <span className="font-sans font-semibold pl-1 whitespace-nowrap" style={{ color: FG }}>
                {r.label}
                {r.partial && <span className="ml-1 text-[8px] font-black" style={{ color: MUTED }}>MTD</span>}
              </span>
              <span className="text-right font-bold" style={{ color: FG }}>{formatINR(r.actual)}</span>
              <span className="text-right font-semibold" style={{ color: MUTED }}>{formatINR(r.target)}</span>
              <span className="flex items-center gap-1.5 pl-3">
                <span className={`flex-1 rounded-full overflow-hidden ${compact ? 'h-1.5' : 'h-2'}`} style={{ background: BORDER }}>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.min(100, r.ach)}%`, background: fill }}
                  />
                </span>
                <span
                  className="text-[10px] font-bold w-10 text-center rounded-[3px] py-0.5"
                  style={{ background: fill, color: INK }}
                >
                  {Math.round(r.ach)}%
                </span>
              </span>
              <span
                className="text-right text-[11px] font-bold"
                style={{ color: r.mom === null ? MUTED : r.mom >= 0 ? HIGH : LOW }}
              >
                {r.mom === null ? '—' : `${r.mom >= 0 ? '▲' : '▼'}${Math.abs(Math.round(r.mom))}%`}
              </span>
              <span className="text-right font-semibold" style={{ color: FG }}>{formatINR(r.avg)}</span>
            </div>
          );
        })}

        {/* FY total */}
        <div
          className={`grid items-center ${compact ? 'min-h-[18px]' : 'min-h-[22px] mt-1'} text-[12px] pt-1 border-t-2 flex-none font-mono tabular-nums`}
          style={{ gridTemplateColumns: COLS, borderColor: 'rgba(34,197,94,0.4)' }}
        >
          <span className="font-sans font-bold tracking-[0.15em] pl-1" style={{ color: FG }}>FYTD</span>
          <span className="text-right font-bold text-[13px]" style={{ color: FG }}>{formatINR(fyActual)}</span>
          <span className="text-right font-bold" style={{ color: MUTED }}>{formatINR(fyTarget)}</span>
          <span className="pl-3">
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-[3px]" style={{ background: pctFill(fyAch), color: INK }}>
              {fyAch.toFixed(1)}%
            </span>
          </span>
          <span />
          <span className="text-right font-bold" style={{ color: FG }}>
            {formatINR(daysDone > 0 ? fyActual / daysDone : 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

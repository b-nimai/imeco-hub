import { formatINR } from '../../data/salesData.js';
import { INK, SURFACE, BORDER, FG, MUTED, pctFill, panelStyle } from './heatScale.js';

const CR = 10000000;
const crLabel = (cr) => `₹${Number(cr.toFixed(2))}Cr`;

// Flat KPI tile, as on the outbound tracker. `pct` (optional) adds a pastel status chip.
function Stat({ label, value, sub, pct }) {
  return (
    <div
      className="flex flex-col justify-center min-w-0 px-2.5 rounded-lg leading-tight"
      style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
    >
      <span className="text-[9px] font-bold tracking-[0.15em] uppercase truncate" style={{ color: MUTED }}>{label}</span>
      <span className="font-bold text-[18px] leading-none my-0.5 tracking-tight truncate" style={{ color: FG }}>
        {value}
      </span>
      {sub && (
        <span className="text-[9px] font-semibold truncate" style={{ color: MUTED }}>
          {pct !== undefined && (
            <span className="font-mono font-bold px-1 mr-1 rounded-[3px]" style={{ background: pctFill(pct), color: INK }}>
              {Math.round(pct)}%
            </span>
          )}
          {sub}
        </span>
      )}
    </div>
  );
}

// Annual target track: one segment per FY month, width ∝ that month's target, fill =
// achieved share of it. Targets come from the sheet (each tab's Target row); months
// without a tab yet fall back to the typed plan and are labelled "plan".
function AnnualTrack({ months, fyActual, plan }) {
  const byLabel = new Map(months.map((m) => [m.label, m]));
  const annual = plan.annualCr * CR;
  const knownCrs = plan.monthly.filter((p) => p.cr).map((p) => p.cr);
  const fallbackFlex = knownCrs.length ? knownCrs.reduce((s, v) => s + v, 0) / knownCrs.length : 1;
  const overallPct = (fyActual / annual) * 100;
  const current = months[months.length - 1];

  return (
    <div className="flex flex-col justify-center min-w-0 flex-1 px-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: MUTED }}>
          Annual Target · {crLabel(plan.annualCr)}
          {plan.planMonths > 0 && (
            <span className="ml-1.5 normal-case tracking-normal font-semibold" style={{ color: MUTED }}>
              (sheet {plan.sheetMonths} mo + plan {plan.planMonths} mo)
            </span>
          )}
        </span>
        <span className="text-[11px] font-bold" style={{ color: MUTED }}>
          <span className="font-mono font-bold text-[15px]" style={{ color: FG }}>{overallPct.toFixed(1)}%</span>
          {' '}of year · {formatINR(Math.max(0, annual - fyActual))} to go
        </span>
      </div>

      <div className="flex gap-[3px] h-[22px]">
        {plan.monthly.map(({ month, cr, source }) => {
          const m = byLabel.get(month);
          const fill = m && m.target > 0 ? Math.min(100, (m.actual / m.target) * 100) : 0;
          const isCurrent = m && current && m.key === current.key;
          const pace = m ? (m.partial
            ? (m.actual / Math.max(1, m.target * (m.daysDone / m.daysInMonth))) * 100
            : (m.actual / Math.max(1, m.target)) * 100) : 0;
          return (
            <div
              key={month}
              className="relative rounded-[3px] overflow-hidden"
              style={{
                flex: cr || fallbackFlex,
                background: m ? SURFACE : 'transparent',
                border: m ? `1px solid ${BORDER}` : `1px dashed ${BORDER}`,
                outline: isCurrent ? `1px solid ${FG}` : 'none',
                outlineOffset: 1,
              }}
              title={m
                ? `${month}: ${formatINR(m.actual)} / ${formatINR(m.target)}`
                : cr ? `${month}: ${crLabel(cr)} (${source === 'sheet' ? 'sheet target' : 'typed plan'})` : `${month}: no target yet`}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${fill}%`, background: m ? pctFill(pace) : 'none' }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-[3px] mt-1">
        {plan.monthly.map(({ month, cr, source }) => {
          const m = byLabel.get(month);
          const isCurrent = m && current && m.key === current.key;
          return (
            <div key={month} className="text-center leading-none" style={{ flex: cr || fallbackFlex }}>
              <div
                className="text-[9px] font-bold tracking-wide"
                style={{ color: isCurrent ? FG : m ? '#d4d4d8' : '#71717a' }}
              >
                {month.toUpperCase()}{isCurrent ? ' ◂' : ''}
              </div>
              <div className="text-[8px] mt-0.5" style={{ color: MUTED }}>
                {cr ? crLabel(cr) : '—'}
                {source === 'plan' && <span className="italic" style={{ color: '#71717a' }}> plan</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FYHero({ scope, stats }) {
  const { currentMTD, currentTarget, currentMonthLabel, months } = scope;
  const achPct = currentTarget > 0 ? (currentMTD / currentTarget) * 100 : 0;
  const annual = Math.max(1, scope.fyPlan.annualCr * CR);

  return (
    <div className="relative rounded-xl overflow-hidden flex items-stretch h-full" style={panelStyle}>
      {/* FYTD headline */}
      <div className="flex flex-col justify-center px-4 py-2 flex-none">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-black px-1.5 py-0.5 rounded-md tracking-widest"
            style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}
          >
            FY OVERVIEW
          </span>
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: MUTED }}>
            {currentMonthLabel} · Year to date
          </span>
        </div>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="font-bold text-[38px] leading-none tracking-tight" style={{ color: FG }}>
            {formatINR(currentMTD)}
          </span>
          <span
            className="font-mono font-bold text-[18px] leading-none px-1.5 py-1 rounded-[4px]"
            style={{ background: pctFill(achPct), color: INK }}
          >
            {achPct.toFixed(1)}%
          </span>
        </div>
        <div className="text-[10px] font-semibold mt-1" style={{ color: MUTED }}>
          of {formatINR(currentTarget)} target ({months[0]?.label}–{months[months.length - 1]?.label}) ·{' '}
          <span className="font-bold" style={{ color: FG }}>{stats.pacePct}% of due-to-date</span>
        </div>
      </div>

      <AnnualTrack months={months} fyActual={currentMTD} plan={scope.fyPlan} />

      {/* Stat grid */}
      <div className="grid grid-cols-3 grid-rows-2 gap-1.5 py-2 pr-2 flex-none w-[46%] max-w-[580px]">
        <Stat label="Avg / Day" value={formatINR(stats.avgDaily)} sub={`${stats.daysDone} selling days`} />
        <Stat
          label="Best Month"
          value={stats.bestMonth ? formatINR(stats.bestMonth.actual) : '—'}
          sub={stats.bestMonth ? `${stats.bestMonth.label} ${stats.bestMonth.year}` : ''}
        />
        <Stat
          label="Best Day"
          value={stats.bestDay ? formatINR(stats.bestDay.revenue) : '—'}
          sub={stats.bestDay ? `${stats.bestDay.monthDay} ${stats.bestDay.month}` : ''}
        />
        <Stat
          label="Days On Target"
          value={`${stats.daysOnTarget}/${stats.daysDone}`}
          sub="hit rate"
          pct={(stats.daysOnTarget / Math.max(1, stats.daysDone)) * 100}
        />
        <Stat
          label="FY Run-Rate"
          value={formatINR(stats.runRate)}
          sub={`of ${crLabel(scope.fyPlan.annualCr)} target`}
          pct={(stats.runRate / annual) * 100}
        />
        <Stat
          label="Required / Day"
          value={formatINR(stats.requiredDaily)}
          sub={`${stats.daysLeftFY} days left in FY`}
        />
      </div>
    </div>
  );
}

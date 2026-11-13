import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { formatINR, formatINRShort } from '../../data/salesData.js';
import { CARD, FG, MUTED, HIGH, MID, LOW, panelStyle } from './heatScale.js';

const ACTUAL = HIGH;
const TARGET = MID;

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const gap = d.cumActual - d.cumTarget;
  return (
    <div className="rounded-lg p-3 text-xs" style={panelStyle}>
      <div className="font-bold text-white mb-1">{d.monthDay} {d.month} · Day {d.day}</div>
      <div className="text-[#a1a1aa]">Cumulative: <span className="text-white font-semibold">{formatINR(d.cumActual)}</span></div>
      <div className="text-[#a1a1aa]">Target: <span className="text-white font-semibold">{formatINR(d.cumTarget)}</span></div>
      <div className="font-bold" style={{ color: gap >= 0 ? HIGH : LOW }}>
        {gap >= 0 ? 'Ahead' : 'Behind'} {formatINR(Math.abs(gap))}
      </div>
    </div>
  );
};

// Running FY revenue vs running target, day by day. Month boundaries are marked so
// the reader can see in which months the gap opened up or closed.
export default function FYCumulativeChart({ series }) {
  const monthStarts = series.filter((d, i) => i === 0 || d.month !== series[i - 1].month);
  const last = series[series.length - 1];
  const gap = last ? last.cumActual - last.cumTarget : 0;
  const gapColor = gap >= 0 ? HIGH : LOW;

  return (
    <div className="rounded-xl p-4 h-full flex flex-col" style={panelStyle}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase" style={{ color: MUTED }}>
          Cumulative Revenue vs Target
        </span>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: ACTUAL }} />
            <span className="text-[#a1a1aa]">Actual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5" style={{ background: TARGET }} />
            <span className="text-[#a1a1aa]">Target</span>
          </div>
          {last && (
            <span
              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-[3px] tracking-wide"
              style={{ background: gapColor, color: '#0a0a0a' }}
            >
              {gap >= 0 ? 'AHEAD' : 'GAP'} {formatINR(Math.abs(gap))}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 14, right: 12, bottom: 0, left: -6 }}>
            <defs>
              <linearGradient id="fyCumGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACTUAL} stopOpacity={0.55} />
                <stop offset="70%" stopColor={ACTUAL} stopOpacity={0.15} />
                <stop offset="100%" stopColor={ACTUAL} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,42,0.6)" vertical={false} />
            <XAxis dataKey="day" hide />
            <YAxis
              tickFormatter={formatINRShort}
              tick={{ fill: MUTED, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(99,190,123,0.4)' }} />
            {monthStarts.map((d) => (
              <ReferenceLine
                key={d.day}
                x={d.day}
                stroke="rgba(161,161,170,0.22)"
                strokeDasharray="2 4"
                label={{ value: d.month.toUpperCase(), position: 'insideTopLeft', fill: FG, fontSize: 11, fontWeight: 800 }}
              />
            ))}
            <Area
              type="monotone"
              dataKey="cumActual"
              name="Actual"
              stroke={ACTUAL}
              strokeWidth={3}
              fill="url(#fyCumGrad)"
              dot={false}
              activeDot={{ r: 5, fill: ACTUAL, stroke: CARD, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="cumTarget"
              name="Target"
              stroke={TARGET}
              strokeWidth={2.5}
              strokeDasharray="6 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

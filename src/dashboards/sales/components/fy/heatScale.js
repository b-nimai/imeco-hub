// ALL TIME palette — the same black surfaces and red → yellow → green pastel ramp the
// Marketplace Dispatch (outbound tracker) wall display uses, so the two screens read as one
// system. Ramp stops are copied from marketplace-dispatch-dashboard/src/lib/heatmapScale.ts;
// keep them in step.

export const LOW = '#f8696b';
export const MID = '#ffeb84';
export const HIGH = '#63be7b';

/** Every filled cell is a light pastel, so ink on a fill is dark unconditionally. */
export const INK = '#0a0a0a';

// Surface family (tracker's .dark tokens)
export const BG = '#000000';
export const CARD = '#111111';
export const SURFACE = '#1a1a1a';
export const BORDER = '#2a2a2a';
export const FG = '#f1f5f9';
export const MUTED = '#a1a1aa';

// Here the colour means "vs target", not "large" as on the tracker: red at or below 40% of
// the target due, yellow at 70%, green from 100% up.
const PCT_RED = 40;
const PCT_GREEN = 100;

/** Pastel fill for an achievement %, along the tracker's ramp. */
export function pctFill(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return SURFACE;
  const t = Math.min(1, Math.max(0, (pct - PCT_RED) / (PCT_GREEN - PCT_RED)));
  return t <= 0.5
    ? `color-mix(in oklab, ${MID} ${(t * 200).toFixed(1)}%, ${LOW})`
    : `color-mix(in oklab, ${HIGH} ${((t - 0.5) * 200).toFixed(1)}%, ${MID})`;
}

export const RAMP_GRADIENT = `linear-gradient(90deg, ${LOW}, ${MID}, ${HIGH})`;
export const RAMP_LEGEND = [`≤${PCT_RED}%`, `${(PCT_RED + PCT_GREEN) / 2}%`, `≥${PCT_GREEN}%`];

/** Flat tracker-style panel. */
export const panelStyle = { background: CARD, border: `1px solid ${BORDER}` };

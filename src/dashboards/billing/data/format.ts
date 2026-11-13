/** Full Indian-grouped figure ("1,18,244") — the grid shows exact amounts. */
export function formatFull(n: number): string {
  const v = Number(n) || 0;
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

import '@/dashboards/stock/components/stock-loader.css';

/** Full-page loader shown while the latest stock is fetched from the Dankuni & Chennai sheets. */
export function StockLoader() {
  return (
    <div
      className="stk-loader flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-6 text-center"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="stk-orb" aria-hidden="true">
        <div className="stk-orb__glow" />
        <div className="stk-orb__track" />
        <div className="stk-orb__arc" />
        <div className="stk-orb__dash" />
        <div className="stk-stack">
          <span className="stk-box stk-box--1" />
          <span className="stk-box stk-box--2" />
          <span className="stk-box stk-box--3" />
          <span className="stk-shelf" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="text-base font-semibold tracking-tight">
          <span className="stk-title">Hold on, we are fetching latest data for you</span>
          <span className="stk-dots text-primary" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]" aria-hidden="true">
          <span className="stk-chip rounded-full border px-2.5 py-0.5">Dankuni sheet</span>
          <span className="stk-chip stk-chip--2 rounded-full border px-2.5 py-0.5">
            Chennai sheet
          </span>
        </div>
      </div>
    </div>
  );
}

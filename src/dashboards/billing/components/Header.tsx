import logo from '@/dashboards/billing/assets/imeco_logo_white.png';
import { LiveClock } from '@/dashboards/billing/components/LiveClock';

interface Props {
  subtitle: string;
  onRefresh: () => void;
  syncing?: boolean;
  updatedAt?: Date;
}

export function Header({ subtitle, onRefresh, syncing = false, updatedAt }: Props) {
  const stamp = updatedAt
    ? updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <header className="billing-card flex flex-none flex-col items-center gap-2 border-b border-[#1a2d45] px-4 py-2.5 sm:flex-row sm:flex-wrap sm:justify-between">
      {/* Logo + Brand */}
      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
        <button
          type="button"
          onClick={onRefresh}
          disabled={syncing}
          title="Refresh data from the sheet"
          aria-label="Refresh billing data"
          className="shrink-0 rounded-md transition-transform hover:scale-105 focus:ring-2 focus:ring-[#22c55e]/40 focus:outline-hidden active:scale-95 disabled:cursor-wait"
        >
          <img src={logo} alt="Imeco" className={`h-7 w-auto sm:h-8 ${syncing ? 'animate-pulse' : ''}`} />
        </button>
        <div className="hidden h-7 w-px bg-[#1a2d45] sm:block" />
        <div className="hidden md:block">
          <div className="text-[12px] leading-none font-medium tracking-widest text-[#94a3b8] uppercase">
            from the house of Amwoodo
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="w-full text-center sm:w-auto">
        <h1 className="text-lg leading-none font-black tracking-[0.2em] text-white uppercase sm:text-xl">
          B2B Billing Cost Dashboard
        </h1>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <div className="billing-pulse-dot" />
          <span className="text-[11px] font-bold tracking-widest text-[#22c55e] uppercase">
            Live from Sheets
          </span>
          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-black tracking-widest text-amber-300 uppercase">
            Incl. GST
          </span>
          <div className="hidden h-3 w-px bg-[#1a2d45] sm:block" />
          <span className="text-[11px] font-medium tracking-widest text-[#94a3b8] uppercase sm:text-[12px]">
            {subtitle}
            {stamp ? ` — Synced ${stamp}` : ''}
          </span>
        </div>
      </div>

      <LiveClock />
    </header>
  );
}

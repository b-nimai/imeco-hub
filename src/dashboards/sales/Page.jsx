import { useState, useEffect, useCallback } from 'react';
import './sales.css';
import { useIsKiosk } from '@/shared/hooks/useKiosk';
import { useSubPage } from '@/shared/hooks/useSubPage';
import Header from './components/Header.jsx';
import KPICard from './components/KPICard.jsx';
import AchievementCard from './components/AchievementCard.jsx';
import MRRGauge from './components/MRRGauge.jsx';
import MonthlyChart from './components/MonthlyChart.jsx';
import DailyChart from './components/DailyChart.jsx';
import ChannelGrid from './components/ChannelGrid.jsx';
import ChannelPieChart from './components/ChannelPieChart.jsx';
import VideoCard from './components/VideoCard.jsx';
import ChannelGrowthPage from './growth/ChannelGrowthPage.jsx';
import FYOverview from './components/fy/FYOverview.jsx';
import { useSalesData } from './hooks/useSalesData.js';
import { useGrowthData } from './growth/useGrowthData.js';
import { useFYData } from './growth/useFYData.js';
import { clearSheetsCache } from './data/sheetsClient.js';
import { formatINR } from './data/salesData.js';

const VIEWS = ['mission', 'growth'];

export default function SalesPage() {
  const { data, syncing, error, fetchedAt, refresh: refreshSales } = useSalesData();
  const { data: growthData, loading: growthLoading, error: growthError, refresh: refreshGrowth } = useGrowthData();
  const { data: fyData, refresh: refreshFY } = useFYData();
  // The view lives in the URL (/sales, /sales/growth) so either can be linked or put on a TV.
  const { page: view, select: setPage } = useSubPage(VIEWS, 'mission');
  const kiosk = useIsKiosk();
  const toggleView = useCallback(
    () => setPage(view === 'mission' ? 'growth' : 'mission', { replace: true }),
    [setPage, view]
  );
  // A month chip picked by hand is remembered together with the month that was current at the
  // time. When a new month's data arrives the pick no longer matches, so the unattended TV
  // moves on to the new current month instead of staying on an old one.
  const [pick, setPick] = useState(null);

  const latestKey = data?.defaultKey;
  const selectedKey = pick && pick.latest === latestKey ? pick.key : null;
  const setSelectedKey = useCallback((key) => setPick({ key, latest: latestKey }), [latestKey]);

  // Manual refresh (Imeco logo): drop the request cache so a just-edited sheet isn't
  // served stale, then refetch all three data sources immediately.
  const handleRefresh = useCallback(() => {
    clearSheetsCache();
    refreshSales();
    refreshGrowth();
    refreshFY();
  }, [refreshSales, refreshGrowth, refreshFY]);

  // Auto-rotate between the two views every 2 minutes — on the wall TV (/tv/sales) only; in
  // the hub someone is driving, and a page flipping under them would be a bug. Keyed on
  // `view` so each change — auto or a manual header toggle — restarts the countdown.
  useEffect(() => {
    if (!kiosk) return undefined;
    const ROTATE_MS = 2 * 60 * 1000;
    const id = setTimeout(toggleView, ROTATE_MS);
    return () => clearTimeout(id);
  }, [kiosk, toggleView]);

  if (!data) {
    return (
      <div className="sales-root flex min-h-full items-center justify-center bg-imeco-bg">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-[#94a3b8] text-sm font-medium tracking-widest uppercase">
            Loading dashboard…
          </div>
        </div>
      </div>
    );
  }

  const { monthlyData, scopes, defaultKey } = data;
  const activeKey = selectedKey ?? defaultKey;
  const scope = scopes.find((s) => s.key === activeKey) ?? scopes[scopes.length - 1];

  const {
    currentMTD, currentTarget, daysDone, totalDays, dailyTarget,
    channelData, dailyData,
    currentMonthLabel, lastMonthSameDays,
  } = scope;

  const vsLastMoPct = lastMonthSameDays && lastMonthSameDays > 0
    ? Math.round(((currentMTD - lastMonthSameDays) / lastMonthSameDays) * 100)
    : null;
  const vsLastMoLabel = vsLastMoPct !== null
    ? `${vsLastMoPct >= 0 ? '▲' : '▼'} ${Math.abs(vsLastMoPct)}% vs LM`
    : null;
  const vsLastMoColor = vsLastMoPct === null
    ? '#94a3b8'
    : vsLastMoPct >= 0 ? '#22c55e' : '#ef4444';

  const achievement = ((currentMTD / currentTarget) * 100).toFixed(1);
  const daysLeft = totalDays - daysDone;
  const dailyAvg = daysDone > 0 ? Math.round(currentMTD / daysDone) : 0;
  const projectedMTD = dailyAvg * totalDays;
  const monthShort = currentMonthLabel.split(' ')[0];

  return (
    <div
      // ALL TIME borrows the outbound tracker's black surface so its pastel heatmap reads bright
      className={`sales-root relative min-h-full lg:h-full flex flex-col bg-imeco-bg bg-grid lg:overflow-hidden ${
        view === 'mission' && scope.key === 'all' ? 'theme-black' : ''
      }`}
      style={{ gap: '8px', padding: '8px' }}
    >
      {/* Status badges */}
      {error && (
        <div className="absolute top-2 right-2 z-50 text-[9px] bg-red-900/80 text-red-300 px-2 py-1 rounded-md border border-red-800/50">
          ⚠ Using cached data
        </div>
      )}
      {syncing && !error && (
        <div className="absolute top-2 right-2 z-50 text-[9px] bg-[#1a2d45]/80 text-[#64748b] px-2 py-1 rounded-md">
          ↻ Syncing…
        </div>
      )}

      {/* Header */}
      <div style={{ animation: 'fadeInUp 0.4s ease-out 0ms both' }}>
        <Header
          currentMonthLabel={currentMonthLabel}
          daysDone={daysDone}
          totalDays={totalDays}
          view={view}
          onToggleView={toggleView}
          growthRange={growthData?.rangeLabel}
          onRefresh={handleRefresh}
          syncing={syncing}
          scopes={scopes}
          activeKey={activeKey}
          onSelectScope={setSelectedKey}
          error={error}
          fetchedAt={fetchedAt}
        />
      </div>

      {/* Active tab — switches instantly between the two views. */}
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        {view === 'growth' ? (
          <ChannelGrowthPage data={growthData} loading={growthLoading} error={growthError} fy={fyData} />
        ) : scope.key === 'all' ? (
          // ALL TIME — dedicated FY-to-date overview (own layout, not the month view)
          <FYOverview scope={scope} videoSlot={<VideoCard />} />
        ) : (
          <>
            {/* KPI Row */}
            <div
              className="flex-none grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 lg:h-[96px]"
              style={{ animation: 'fadeInUp 0.4s ease-out 80ms both' }}
            >
              <KPICard
                label="MTD Revenue"
                value={formatINR(currentMTD)}
                sub={`${daysLeft} days remaining`}
                badge={currentMonthLabel.toUpperCase()}
                badgeColor="#22c55e"
                accent="#22c55e"
                cornerBadge={vsLastMoLabel}
                cornerColor={vsLastMoColor}
              />
              <KPICard
                label="Monthly Target"
                value={formatINR(currentTarget)}
                sub={`Daily need: ${formatINR(dailyTarget)}`}
                badge="TARGET"
                badgeColor="#f59e0b"
              />
              <AchievementCard
                achievement={`${achievement}%`}
                daysDone={daysDone}
                totalDays={totalDays}
                dailyData={dailyData}
                currentTarget={currentTarget}
              />
              <KPICard
                label="Daily Avg Pace"
                value={formatINR(dailyAvg)}
                sub={`Need ${formatINR(Math.max(0, dailyTarget - dailyAvg))} more/day`}
                badge="PACE"
                badgeColor={dailyAvg >= dailyTarget ? '#22c55e' : '#fb923c'}
                accent={dailyAvg >= dailyTarget ? '#22c55e' : '#f1f5f9'}
              />
              <KPICard
                label={`${monthShort} Projection`}
                value={formatINR(projectedMTD)}
                sub={`vs ${formatINR(currentTarget)} target`}
                badge={projectedMTD >= currentTarget ? 'WILL HIT' : 'SHORTFALL'}
                badgeColor={projectedMTD >= currentTarget ? '#22c55e' : '#ef4444'}
              />
            </div>

            {/* Charts Row — DailyChart gets 2 cols, VideoCard removed (now floating) */}
            <div
              className="flex-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2"
              style={{ animation: 'fadeInUp 0.4s ease-out 180ms both' }}
            >
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 h-[220px] lg:h-[260px]">
                <MonthlyChart monthlyData={monthlyData} />
              </div>
              <div className="col-span-1 sm:col-span-2 lg:col-span-2 h-[220px] lg:h-[260px]">
                <DailyChart
                  dailyData={dailyData}
                  dailyTarget={dailyTarget}
                  monthShort={monthShort}
                  daysDone={daysDone}
                />
              </div>
              <div className="col-span-1 h-[200px] lg:h-[260px]">
                <ChannelPieChart channelData={channelData} monthShort={monthShort} />
              </div>
              <div className="col-span-1 h-[200px] lg:h-[260px]">
                <MRRGauge mrrGoal={currentTarget} currentMRR={currentMTD} />
              </div>
            </div>

            {/* Channel Grid */}
            <div
              className="flex-1 min-h-0 lg:min-h-0"
              style={{ animation: 'fadeInUp 0.4s ease-out 280ms both' }}
            >
              <ChannelGrid
                channelData={channelData}
                currentMonthLabel={currentMonthLabel}
                daysDone={daysDone}
                totalDays={totalDays}
                videoSlot={<VideoCard />}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

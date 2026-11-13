import { useCallback, useMemo, useState } from 'react';
import { Outlet } from 'react-router';

import { dashboards } from '@/app/registry';
import { Sidebar } from '@/shared/components/Sidebar';
import { NavBadgesContext, type NavBadges } from '@/shared/hooks/useNavBadges';
import { useTheme } from '@/shared/hooks/useTheme';

const COLLAPSE_KEY = 'hub:sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The interactive layout: hub sidebar on the left, the open dashboard filling the rest. */
export function AppShell() {
  const [theme, toggleTheme] = useTheme();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [badges, setAllBadges] = useState<NavBadges>({});

  function collapse(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* remembered for this visit only */
    }
  }

  // Each dashboard publishes its own badges; namespace them so dashboards can't collide.
  const setBadges = useCallback((dashboardId: string, next: NavBadges) => {
    setAllBadges((prev) => {
      const kept = Object.fromEntries(
        Object.entries(prev).filter(
          ([k]) => k !== dashboardId && !k.startsWith(`${dashboardId}/`),
        ),
      );
      const added = Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k ? `${dashboardId}/${k}` : dashboardId, v]),
      );
      return { ...kept, ...added };
    });
  }, []);

  const badgeApi = useMemo(() => ({ badges, setBadges }), [badges, setBadges]);

  return (
    <NavBadgesContext.Provider value={badgeApi}>
      <div className="flex h-svh flex-col bg-background md:flex-row">
        <Sidebar
          dashboards={dashboards}
          badges={badges}
          collapsed={collapsed}
          onCollapsedChange={collapse}
          theme={theme}
          onThemeToggle={toggleTheme}
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </NavBadgesContext.Provider>
  );
}

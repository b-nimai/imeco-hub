import { useLayoutEffect } from 'react';
import { Outlet } from 'react-router';

import { KioskContext } from '@/shared/hooks/useKiosk';
import { useKioskMode } from '@/shared/hooks/useKioskMode';

/**
 * The wall-TV layout under `/tv/*`: no sidebar, dark pinned, and the screen kept awake
 * (wake lock + fallbacks, reload every 6h — see useKioskMode).
 */
export function KioskShell() {
  useKioskMode();

  // index.html already skips the saved light theme on /tv, but a client-side navigation from
  // the tabbed app lands here without a reload — so pin it here too, and restore on leave.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    const prevScheme = root.style.colorScheme;
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
    return () => {
      root.classList.toggle('dark', wasDark);
      root.style.colorScheme = prevScheme;
    };
  }, []);

  return (
    <KioskContext.Provider value={true}>
      <div className="h-svh overflow-y-auto bg-background">
        <Outlet />
      </div>
    </KioskContext.Provider>
  );
}

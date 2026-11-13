import { createContext, useContext, useEffect } from 'react';

/** A small count beside a sidebar entry. `alert` renders it amber: a count that is a problem. */
export interface NavBadge {
  n?: number;
  alert?: boolean;
}

/** Keyed by `<dashboardId>` or `<dashboardId>/<pageId>`. */
export type NavBadges = Record<string, NavBadge>;

export interface NavBadgesApi {
  badges: NavBadges;
  setBadges: (dashboardId: string, badges: NavBadges) => void;
}

export const NavBadgesContext = createContext<NavBadgesApi>({
  badges: {},
  setBadges: () => {},
});

/**
 * Lets a dashboard publish counts to the hub sidebar (e.g. "3 out of stock" beside Stock).
 * Keys inside `badges` are page ids; they are namespaced under `dashboardId` here. Cleared
 * when the dashboard unmounts.
 */
export function usePublishNavBadges(dashboardId: string, badges: NavBadges): void {
  const { setBadges } = useContext(NavBadgesContext);
  const serialised = JSON.stringify(badges);

  useEffect(() => {
    setBadges(dashboardId, JSON.parse(serialised) as NavBadges);
  }, [setBadges, dashboardId, serialised]);

  useEffect(() => () => setBadges(dashboardId, {}), [setBadges, dashboardId]);
}

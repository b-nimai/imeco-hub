import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter } from 'react-router';

import { AppShell } from '@/app/AppShell';
import { Home } from '@/app/Home';
import { KioskShell } from '@/app/KioskShell';
import { NotFound } from '@/app/NotFound';
import { RouteError } from '@/app/RouteError';
import { dashboards } from '@/app/registry';
import { Skeleton } from '@/shared/components/ui/skeleton';
import type { DashboardModule } from '@/shared/types/dashboard';

// One lazy component per dashboard, created once. The same component serves both the tabbed
// route and the kiosk route, so switching between them never re-downloads its chunk.
const components = new Map<string, LazyExoticComponent<ComponentType>>(
  dashboards.map((d) => [d.id, lazy(d.load)]),
);

function dashboardRoute(d: DashboardModule) {
  const Component = components.get(d.id)!;
  return {
    // Splat so a dashboard can own sub-paths (`/prices/trends`); see useSubPage.
    path: `${d.id}/*`,
    // Per dashboard, so one failing keeps the shell (and every other dashboard) usable.
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<Skeleton className="m-3 h-[calc(100%-1.5rem)] min-h-96 rounded-xl" />}>
        <Component />
      </Suspense>
    ),
  };
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [{ index: true, element: <Home /> }, ...dashboards.map(dashboardRoute)],
  },
  {
    path: '/tv',
    element: <KioskShell />,
    errorElement: <RouteError />,
    children: dashboards.map(dashboardRoute),
  },
  { path: '*', element: <NotFound /> },
]);

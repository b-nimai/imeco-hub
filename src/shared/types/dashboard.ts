import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

/** A page inside a dashboard (e.g. the price tracker's Trends tab). The first one is the default. */
export interface SubPage {
  id: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Everything the hub needs to know about one dashboard. Each `src/dashboards/<id>/index.ts`
 * exports one of these, and `src/app/registry.ts` lists them.
 *
 * Keep the manifest file tiny: it is imported eagerly by the shell. All real code sits behind
 * `load()`, so it lands in that dashboard's own chunk and is downloaded only when opened.
 */
export interface DashboardModule {
  /** URL segment: the dashboard lives at `/<id>` and, on a TV, at `/tv/<id>`. */
  id: string;
  label: string;
  icon: LucideIcon;
  /** One line for the home page card. */
  description: string;
  /** The dashboard's root component. Must be a dynamic `import()`. */
  load: () => Promise<{ default: ComponentType }>;
  /** Sub-pages, shown nested under the dashboard in the sidebar. Omit for a single screen. */
  pages?: readonly SubPage[];
}

# IMECO Mission Control

All IMECO dashboards in one site, each as its own section, plus a full-screen TV view for each one.

| Dashboard | Route | TV route | Data source |
|---|---|---|---|
| Sales Mission Control | `/sales`, `/sales/growth` | `/tv/sales` (rotates the two views every 2 min) | Google Sheets (DSR workbook) |
| Price Tracker | `/prices`, `/prices/<tab>` | `/tv/prices` | Supabase (PostgREST, read-only anon key) |
| B2B Billing | `/billing` | `/tv/billing` | Google Sheets |
| Marketplace Dispatch | `/dispatch` | `/tv/dispatch` | Google Sheets (Outbound Tracker) |

The Price Tracker's tabs are `overview`, `prices`, `trends`, `availability`, `reviews`, `competitors` and `search`. Old `#trends`-style links are redirected to the matching routed path.

The price scraper (Python desktop app and its `.exe` build) still lives in the **IMECO-price-tracker** repo. It writes to Supabase; this site only reads from it.

## Stack
React 19, Vite 8, TypeScript, Tailwind v4, shadcn (`base-nova` on `@base-ui/react`), React Router 7 and Vitest. Sales uses recharts.

Sales (`src/dashboards/sales`) is still plain JavaScript (`.jsx`), carried over from mission-control-dashboard. It builds and lints with the rest; it is just not type-checked yet. Its charts sit in a separate `vendor-charts` chunk that only Sales loads.

## Setup
```bash
cp .env.example .env   # fill in the values, see comments in the file
npm install
npm run dev            # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run build` | Type-check, then production build into `dist/` |
| `npm test` | Vitest suites from all dashboards |
| `npm run lint` | ESLint, including the dashboard-boundary rules |
| `npm run typecheck` | `tsc` only |
| `npm run format` | Prettier |

## Structure
```
src/
  app/            shell, router, registry: the hub itself
    registry.ts   the ONE list of dashboards
    router.tsx    builds /<id>/* and /tv/<id>/* from the registry
    AppShell.tsx  sidebar + outlet (interactive use)
    KioskShell.tsx  no sidebar, dark pinned, wake lock + 6h reload (wall TVs)
  shared/         code any dashboard may use
    components/   Sidebar, LogoMark, LiveClock, ui/ (shadcn primitives)
    hooks/        useTheme, useKioskMode, useSubPage, useNavBadges, useKiosk
    data/         sheetsClient (retry/backoff + memory cache + localStorage helpers)
    types/        DashboardModule contract
  dashboards/
    <id>/index.ts   small manifest: id, label, icon, description, load(), pages?
    <id>/Page.tsx   root component (lazy-loaded)
    <id>/...        components, data, hooks, views private to that dashboard
```

**Rules** (enforced by ESLint):
- A dashboard may import `@/shared/*` and its own folder. It must never import another dashboard or `@/app/*`.
- `shared/` never imports from `dashboards/` or `app/`.

**Performance:**
- Each dashboard is a separate lazy chunk, so opening Billing downloads none of the Price Tracker's code, and the reverse is also true.
- Data polling runs only while that dashboard is mounted.
- React and the router sit in a long-cached `vendor-react` chunk.
- `vercel.json` marks the hashed assets immutable.

## Adding a new dashboard
1. Create `src/dashboards/<id>/Page.tsx` with a default-exported component. It renders inside a scrollable area: use `min-h-full`, and add `lg:h-full` for a one-screen layout.
2. Create `src/dashboards/<id>/index.ts`:
   ```ts
   import { Gauge } from 'lucide-react';
   import type { DashboardModule } from '@/shared/types/dashboard';

   export const myDash: DashboardModule = {
     id: 'my-dash',
     label: 'My Dashboard',
     icon: Gauge,
     description: 'One line for the home page card.',
     load: () => import('./Page'),
     // pages: [{ id: 'summary', label: 'Summary', icon: … }, …]  // optional sub-pages
   };
   ```
3. Add it to the array in `src/app/registry.ts`, and add `'my-dash'` to `DASHBOARDS` in `eslint.config.js`.
4. If it needs config, add `VITE_*` vars to `.env.example` and `src/vite-env.d.ts`, and set them in Vercel.
5. Optional pieces, as needed:
   - **Sub-pages:** `useSubPage(ids, defaultId)` gives the current page and a navigate function.
   - **Sidebar badges:** `usePublishNavBadges(id, {...})`.
   - **TV-specific behaviour:** `useIsKiosk()`.
   - **Google Sheets data:** `@/shared/data/sheetsClient`. Namespace any localStorage key as `hub:<id>:…`.

The sidebar entry, `/<id>`, `/tv/<id>`, the home card and code splitting all come from the registry entry.

## Deploying (Vercel)
1. Create a Vercel project from this repo. Vite is auto-detected. `vercel.json` adds the SPA rewrite, so deep links like `/prices/trends` work on refresh.
2. Set the env vars from `.env.example`.
3. In Google Cloud, **add the new domain to the API key's HTTP-referrer allow-list**. Otherwise Billing and Dispatch get a 403.
4. Point the wall TVs at `https://<domain>/tv/sales`, `/tv/billing`, `/tv/dispatch` and `/tv/prices`.
5. Retire the three old deployments once the new one is confirmed.

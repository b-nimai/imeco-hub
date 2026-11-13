# IMECO Mission Control (imeco-hub)

One Vite SPA that hosts every IMECO dashboard. Read README.md "Structure" and "Adding a new dashboard" before changing the layout.

- Dashboards live in `src/dashboards/<id>/` and are listed in `src/app/registry.ts`. Never import one dashboard from another; put shared code in `src/shared/`. ESLint enforces this, so update `DASHBOARDS` in `eslint.config.js` when adding a dashboard.
- Keep `src/dashboards/<id>/index.ts` tiny. It is loaded eagerly. Everything heavy goes behind `load: () => import('./Page')`.
- Every route works both in the shell (`/<id>`) and full-screen (`/tv/<id>`). Don't assume the sidebar is present, and don't hard-code `/prices/...` paths. Use `useSubPage`.
- localStorage keys must be namespaced `hub:<id>:…`, since all dashboards share one origin.
- All `VITE_*` env vars are public (inlined into the bundle). Never add a Supabase service_role key or any other secret.
- Before finishing: `npm run typecheck && npm run lint && npm test && npm run build`.
- Commits: no Co-Authored-By line.

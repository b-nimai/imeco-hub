import {
  Home,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';

import { LiveClock } from '@/shared/components/LiveClock';
import { LogoMark } from '@/shared/components/LogoMark';
import { Dialog, DialogBody, DialogContent, DialogTitle } from '@/shared/components/ui/dialog';
import type { NavBadge, NavBadges } from '@/shared/hooks/useNavBadges';
import type { Theme } from '@/shared/hooks/useTheme';
import { cn } from '@/shared/lib/utils';
import type { DashboardModule } from '@/shared/types/dashboard';

interface Props {
  dashboards: readonly DashboardModule[];
  badges: NavBadges;
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
  theme: Theme;
  onThemeToggle: () => void;
}

interface Entry {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: NavBadge;
  /** A sub-page, drawn indented under its dashboard. */
  nested?: boolean;
}

/** Flatten the registry into sidebar rows. Sub-pages show only under the open dashboard. */
function buildEntries(
  dashboards: readonly DashboardModule[],
  pathname: string,
  badges: NavBadges,
): Entry[] {
  const segments = pathname.split('/').filter(Boolean);
  const [openId, openPage] = segments;
  const entries: Entry[] = [
    { key: 'home', to: '/', label: 'Home', icon: Home, active: segments.length === 0 },
  ];

  for (const d of dashboards) {
    const open = d.id === openId;
    entries.push({
      key: d.id,
      to: `/${d.id}`,
      label: d.label,
      icon: d.icon,
      active: open && !d.pages,
      badge: badges[d.id],
    });
    if (!open || !d.pages) continue;
    d.pages.forEach((p, i) => {
      const isDefault = i === 0;
      entries.push({
        key: `${d.id}/${p.id}`,
        to: isDefault ? `/${d.id}` : `/${d.id}/${p.id}`,
        label: p.label,
        icon: p.icon,
        active: openPage === p.id || (isDefault && !openPage),
        badge: badges[`${d.id}/${p.id}`],
        nested: true,
      });
    });
  }
  return entries;
}

function Badge({ badge }: { badge?: NavBadge }) {
  if (!badge?.n) return null;
  return (
    <span
      className={cn(
        'ml-auto rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums',
        badge.alert ? 'bg-amber-500/15 text-warn' : 'bg-muted text-muted-foreground',
      )}
    >
      {badge.n}
    </span>
  );
}

function NavList({
  entries,
  collapsed,
  onNavigate,
}: {
  entries: Entry[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Dashboards">
      {entries
        // Collapsed to icons, sub-pages would read as unlabeled extra dashboards.
        .filter((e) => !(collapsed && e.nested))
        .map(({ key, to, label, icon: Icon, active, badge, nested }) => (
          <Link
            key={key}
            to={to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-primary/12 font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              nested && 'ml-4 h-8 text-[13px]',
              collapsed && 'justify-center px-0',
            )}
          >
            {active && (
              <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-primary" />
            )}
            <Icon className={cn('size-4 shrink-0', active && 'text-primary')} aria-hidden />
            {!collapsed && <span className="truncate">{label}</span>}
            {!collapsed && <Badge badge={badge} />}
            {collapsed && badge?.n ? (
              <span
                className={cn(
                  'absolute top-1 right-1.5 size-1.5 rounded-full',
                  badge.alert ? 'bg-amber-400' : 'bg-muted-foreground/60',
                )}
              />
            ) : null}
          </Link>
        ))}
    </nav>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

/**
 * The hub's left rail: brand, every registered dashboard (with the open one's sub-pages
 * nested), and clock + theme at the foot. Collapses to icons; below `md` it becomes a top bar
 * whose menu opens the same list in a drawer.
 */
export function Sidebar({
  dashboards,
  badges,
  collapsed,
  onCollapsedChange,
  theme,
  onThemeToggle,
}: Props) {
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  const entries = buildEntries(dashboards, pathname, badges);

  const themeButton = (
    <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={onThemeToggle}>
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </IconButton>
  );

  return (
    <>
      {/* Phone / narrow tablet: a top bar, the list in a drawer. */}
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-sidebar px-3 py-2 md:hidden">
        <IconButton label="Open menu" onClick={() => setDrawer(true)}>
          <Menu className="size-5" />
        </IconButton>
        <Link to="/" className="rounded-md bg-black px-1">
          <LogoMark syncing={false} />
        </Link>
        <span className="ml-auto">{themeButton}</span>
      </div>
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogContent side="left" className="max-w-72">
          <DialogTitle className="px-4 pt-4 text-sm tracking-widest text-muted-foreground uppercase">
            Mission Control
          </DialogTitle>
          <DialogBody className="flex flex-col gap-4">
            <NavList entries={entries} collapsed={false} onNavigate={() => setDrawer(false)} />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Laptop and up: the rail. */}
      <aside
        className={cn(
          'sticky top-0 hidden h-svh flex-none flex-col gap-4 border-r border-border bg-sidebar py-3 transition-[width] duration-200 md:flex',
          collapsed ? 'w-16 px-2' : 'w-60 px-3',
        )}
      >
        {/* The logo video is white on black and blends with `screen`, so it always sits on its
            own black tile — that keeps it legible on the light theme too. */}
        {collapsed ? (
          <Link
            to="/"
            title="Home"
            className="mx-auto flex size-10 items-center justify-center rounded-lg bg-black text-lg font-black text-white"
          >
            i
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            <Link to="/" title="Home" className="w-fit rounded-lg bg-black px-1.5">
              <LogoMark syncing={false} />
            </Link>
            <span className="px-1 text-xs font-black tracking-[0.2em] text-foreground uppercase">
              Mission Control
            </span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList entries={entries} collapsed={collapsed} />
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {!collapsed && (
            <div className="px-1">
              <LiveClock />
            </div>
          )}
          <div
            className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'justify-between')}
          >
            {themeButton}
            <IconButton
              label={collapsed ? 'Expand menu' : 'Collapse menu'}
              onClick={() => onCollapsedChange(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </IconButton>
          </div>
        </div>
      </aside>
    </>
  );
}

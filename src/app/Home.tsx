import { ArrowRight, Tv } from 'lucide-react';
import { Link } from 'react-router';

import { dashboards } from '@/app/registry';

/** Landing page: one card per registered dashboard, plus its wall-TV link. */
export function Home() {
  return (
    <div className="bg-grid flex min-h-full flex-col gap-4 p-3 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Mission Control</h1>
        <p className="text-xs text-muted-foreground">Every IMECO dashboard in one place</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dashboards.map(({ id, label, icon: Icon, description }) => (
          <div
            key={id}
            className="card-glass animate-fade-in-up flex flex-col gap-3 rounded-xl p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="text-base font-semibold text-foreground">{label}</h2>
            </div>
            <p className="flex-1 text-sm text-muted-foreground">{description}</p>
            <div className="flex items-center justify-between gap-2">
              <Link
                to={`/${id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Open <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                to={`/tv/${id}`}
                title="Full-screen view for a wall TV"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Tv className="size-4" aria-hidden /> TV mode
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

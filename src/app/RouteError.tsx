import { useRouteError } from 'react-router';

/**
 * Shown when a dashboard throws while rendering, or its chunk fails to download (typically a
 * stale tab after a deploy). One dashboard failing must not look like the whole hub is down.
 */
export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);
  const staleChunk = /dynamically imported module|Failed to fetch|Importing a module script/i.test(
    message,
  );

  return (
    <div className="flex h-full min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center md:min-h-0">
      <h1 className="text-lg font-semibold text-foreground">
        {staleChunk ? 'A new version is available' : 'This dashboard hit an error'}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {staleChunk ? 'Reload to get the latest version.' : message}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Reload
      </button>
    </div>
  );
}

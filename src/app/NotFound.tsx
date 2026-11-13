import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="flex h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground">That dashboard or page doesn&apos;t exist.</p>
      <Link to="/" className="text-sm font-semibold text-primary hover:underline">
        Back to Mission Control
      </Link>
    </div>
  );
}

import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

/**
 * The current sub-page of a dashboard, read from the URL (`/prices/trends` → `trends`), plus a
 * setter that navigates. Works the same under `/<id>/*` and `/tv/<id>/*`, because the base is
 * derived from the matched path rather than hard-coded.
 *
 * A missing or unknown segment means `fallback`, which maps to the bare dashboard URL.
 */
export function useSubPage<T extends string>(
  pages: readonly T[],
  fallback: T,
): { page: T; select: (next: T, opts?: { replace?: boolean }) => void; base: string } {
  const splat = useParams()['*'] ?? '';
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const first = splat.split('/')[0] as T;
  const page = pages.includes(first) ? first : fallback;
  const base = pathname.slice(0, pathname.length - splat.length).replace(/\/$/, '');

  const select = useCallback(
    (next: T, opts?: { replace?: boolean }) =>
      navigate(next === fallback ? base : `${base}/${next}`, { replace: opts?.replace }),
    [navigate, base, fallback],
  );

  return { page, select, base };
}

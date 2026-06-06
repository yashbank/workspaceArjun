'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * After the dashboard paints, proactively warm the Router Cache for the sections
 * the current user can reach, so the first click into each feels instant. Runs
 * once on idle; router.prefetch is duplicate-safe and only fetches RSC payloads
 * the user is already allowed to load (RBAC unchanged). Role-gated to avoid
 * prefetching admin routes for members.
 */
export function RoutePrefetcher({
  canAdmin = false,
  canSettings = false,
  canActivity = false,
}: {
  canAdmin?: boolean;
  canSettings?: boolean;
  canActivity?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const routes = ['/files'];
    if (canActivity) routes.push('/activity');
    if (canAdmin) routes.push('/admin', '/admin/security');
    if (canSettings) routes.push('/admin/settings');

    const run = () => routes.forEach((r) => router.prefetch(r));

    const ric = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;

    if (ric) {
      const id = ric(run, { timeout: 2000 });
      return () => {
        (window as typeof window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(
          id,
        );
      };
    }
    const t = setTimeout(run, 800);
    return () => clearTimeout(t);
  }, [router, canAdmin, canSettings, canActivity]);

  return null;
}

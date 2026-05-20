'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const SETUP_PATH = '/account/name';

export function DisplayNameGuard({
  needsDisplayName,
  children,
}: {
  needsDisplayName: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (needsDisplayName && pathname !== SETUP_PATH) {
      router.replace(SETUP_PATH);
    }
  }, [needsDisplayName, pathname, router]);

  if (needsDisplayName && pathname !== SETUP_PATH) {
    return null;
  }

  return children;
}

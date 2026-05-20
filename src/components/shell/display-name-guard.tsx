'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const SETUP_PATH = '/account/name';

export function DisplayNameGuard({
  needsSetup,
  children,
}: {
  needsSetup: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (needsSetup && pathname !== SETUP_PATH) {
      router.replace(SETUP_PATH);
    }
  }, [needsSetup, pathname, router]);

  if (needsSetup && pathname !== SETUP_PATH) {
    return null;
  }

  return children;
}

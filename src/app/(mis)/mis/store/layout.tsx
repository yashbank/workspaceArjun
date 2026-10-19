import type { ReactNode } from 'react';

import { StoreSidebar } from '@/components/mis/store/store-sidebar';
import { storeNavFor } from '@/lib/mis/store-nav';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';

/** R2-64: every Store page sits under the grouped Store menu. */
export default async function StoreLayout({ children }: { children: ReactNode }) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  return <StoreSidebar groups={storeNavFor(role)}>{children}</StoreSidebar>;
}

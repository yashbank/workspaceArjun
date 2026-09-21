import { MasterDataDesktopServer } from '@/components/mis/desktop/master-data-desktop-server';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listItems } from '@/server/mis/item';
import { ItemScreen } from '@/components/mis/items/item-screen';

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; deactivated?: string; edit?: string; create?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireMisAccess();
  const [items, canWrite] = await Promise.all([listItems(), checkPermission('masters.write')]);
  const phone = <ItemScreen items={items} canWrite={canWrite} />;

  // D10 from 1024px up; the existing screen below it. ANY explicit `?view` is the existing screen at every width.
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <MasterDataDesktopServer master="items" searchParams={sp} />
      </div>
    </>
  );
}

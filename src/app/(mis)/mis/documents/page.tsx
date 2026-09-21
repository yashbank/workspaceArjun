import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { DocumentsScreen } from '@/components/mis/documents/documents-screen';
import { DocumentsDesktopServer } from '@/components/mis/desktop/documents-desktop-server';

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; group?: string; doc?: string; page?: string; add?: string; added?: string }> }) {
  const sp = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'orders.write');
  const orders = await listOrders();
  const phone = <DocumentsScreen orders={orders as any[]} canWrite={canWrite} />;

  // D13 from 1024px up; the existing screen below it. ANY explicit `?view` is the existing screen at every width.
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <DocumentsDesktopServer searchParams={sp} />
      </div>
    </>
  );
}

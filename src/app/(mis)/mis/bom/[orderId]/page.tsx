import { requireMisAccess } from '@/server/mis/guard';
import { getBom } from '@/server/mis/bom';
import { getBomDesktopView } from '@/server/mis/bom-desktop';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { BomScreen } from '@/components/mis/bom/bom-screen';
import { BomDesktop } from '@/components/mis/desktop/bom-desktop';

// Prisma's Decimal is handed to the phone screen as before; the screen types it as a number.
type BomProp = React.ComponentProps<typeof BomScreen>['bom'];

export default async function BomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ view?: string; costing?: string }>;
}) {
  const { orderId } = await params;
  const { view, costing } = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'orders.write');
  const isOwner = can(role, 'wages.read');
  const bom = await getBom(orderId);
  const phone = <BomScreen bom={bom as unknown as BomProp} orderId={orderId} canWrite={canWrite} isOwner={isOwner} />;

  // D6 from 1024px up. `?view=edit` keeps the editable structure (add stage / add material, approve)
  // one link away on a desktop, because D6 is the reading view. `?costing=off` drops the cost
  // column server-side — the Owner's toggle refetches, it does not hide. A role that may not see
  // costing gets the same screen without it whatever this says (getBomDesktopView decides, D24).
  const desktop = view === 'edit' || !bom ? null : await getBomDesktopView(orderId, { costing: costing !== 'off' });
  if (!desktop) return phone;

  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <BomDesktop data={desktop} />
      </div>
    </>
  );
}

import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/mis/ids';
import { toPlain } from '@/lib/mis/plain';
import { requireMisAccess } from '@/server/mis/guard';
import { getBom } from '@/server/mis/bom';
import { getBomDesktopView } from '@/server/mis/bom-desktop';
import { listProcesses } from '@/server/mis/process';
import { listItems } from '@/server/mis/item';
import { listOptions } from '@/server/mis/master-option';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { BomScreen } from '@/components/mis/bom/bom-screen';
import { BomDesktop } from '@/components/mis/desktop/bom-desktop';

// A Prisma Decimal cannot cross to a Client Component (F-24): `toPlain` makes every one a number first.
type BomProp = React.ComponentProps<typeof BomScreen>['bom'];

export default async function BomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ view?: string; costing?: string }>;
}) {
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();
  const { view, costing } = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'orders.write');
  const isOwner = can(role, 'wages.read');
  const bom = await getBom(orderId);
  // R2-70: stage names come from the Master Processes list (needs masters.read; without it the screen falls back to free text).
  const processes = canWrite ? (await listProcesses().catch(() => [])).filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name })) : [];
  // R2-10: the catalog for the material picker (needs masters.read; without it the picker is simply not shown).
  const items =
    canWrite && can(role, 'masters.read')
      ? (await listItems().catch(() => []))
          .filter((i) => i.isActive !== false && !i.deletedAt)
          .map((i) => ({ id: i.id, code: i.code, name: i.name, unit: String(i.unit ?? '') }))
      : [];
  // R2-154: the Unit field is a searchable dropdown from Master Units (needs masters.read; without it it falls back to free text).
  const units = canWrite && can(role, 'masters.read')
    ? (await listOptions('UNIT').catch(() => [])).map((o) => ({ value: o.value, label: o.label }))
    : [];
  const phone = <BomScreen bom={toPlain(bom) as unknown as BomProp} orderId={orderId} canWrite={canWrite} isOwner={isOwner} processes={processes} items={items} units={units} />;

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

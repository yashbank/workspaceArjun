import { ReceiveScreen } from '@/components/mis/store/receive-screen';
import { formatFactoryDateTime } from '@/lib/mis/factory-time';
import { checkPermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { requireMisAccess } from '@/server/mis/guard';
import { listOpenPOs, listPickerItems, listReceiveSuppliers } from '@/server/mis/store';

/**
 * Goods in — the cart flow.
 *
 * Thin by design: fetch the three lists the cart needs and hand them over. The
 * permission checks live in the server module, so an account without
 * `store.read` never gets past the first await.
 */
export default async function StoreReceivePage() {
  const user = await requireMisAccess();
  const [items, suppliers, openPos, canSetRate, canOverride, zone] = await Promise.all([
    listPickerItems(),
    listReceiveSuppliers(),
    listOpenPOs(),
    checkPermission('wages.read'),
    // `supplier_invoice.write` is held by exactly Owner and Admin: the roles that may override the 2% receipt limit.
    checkPermission('supplier_invoice.write'),
    getFactoryTimezone(),
  ]);

  const meta = `${formatFactoryDateTime(new Date(), zone)} · ${user.name ?? user.email}`;

  return (
    <ReceiveScreen
      header={{ title: 'Receive', meta }}
      items={items}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      openPos={openPos}
      canSetRate={canSetRate}
      canOverride={canOverride}
    />
  );
}

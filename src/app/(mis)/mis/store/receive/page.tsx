import { format } from 'date-fns';

import { ReceiveScreen } from '@/components/mis/store/receive-screen';
import { checkPermission } from '@/server/mis/auth';
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
  const [items, suppliers, openPos, canSetRate] = await Promise.all([
    listPickerItems(),
    listReceiveSuppliers(),
    listOpenPOs(),
    checkPermission('wages.read'),
  ]);

  const meta = `${format(new Date(), 'EEE d MMM · HH:mm')} · ${user.name ?? user.email}`;

  return (
    <ReceiveScreen
      header={{ title: 'Receive', meta }}
      items={items}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      openPos={openPos}
      canSetRate={canSetRate}
    />
  );
}

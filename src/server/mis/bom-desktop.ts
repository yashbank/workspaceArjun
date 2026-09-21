/**
 * The desktop BOM (D6): one tree, and the Owner sees an extra column, not a different screen.
 *
 * Composed from functions the phone layer already uses — the order, the BOM structure, and (for
 * an Owner) the costing overlay. **A second view of the same data, never a second data path.**
 *
 * D6: "An overlay, deliberately not a second screen. Same rows, same order, one column added. Two
 * screens would drift apart inside a month and the costed one would quietly become the real one."
 * So the structure is built ONCE, and the money fields are merged onto it afterwards only when the
 * caller may see them.
 *
 * **Who may see the rupee (D24).** `canCost` is `can(role, 'wages.read')`. For anyone else,
 * `getBomCosting` is never called — asking for `costing: true` changes nothing — and the returned
 * object has no cost, subtotal, unpriced or costing key at all. `getBom` has already removed the
 * rate from the structure for them (F-06, closed in 24C), so there is no second route to it.
 */

import type { BomDesktopData, BomStageView } from '@/lib/mis/bom-desktop';
import { factoryDateKey } from '@/lib/mis/factory-time';
import { can } from '@/lib/mis/permissions';

import { requirePermission } from './auth';
import { getBom, getBomCosting } from './bom';
import { getFactoryTimezone } from './business-rules';
import { getOrder } from './orders';

const qty = (n: unknown) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n));

export async function getBomDesktopView(
  orderId: string,
  options: { costing?: boolean } = {},
): Promise<BomDesktopData | null> {
  const actor = await requirePermission('orders.read');

  const [order, bom, timeZone] = await Promise.all([getOrder(orderId), getBom(orderId), getFactoryTimezone()]);
  if (!order || !bom) return null;

  const canCost = can(actor.role, 'wages.read');
  // Asked for AND allowed. A role that may not see costing never reaches getBomCosting.
  const costing = canCost && options.costing !== false ? await getBomCosting(orderId) : null;

  const stages: BomStageView[] = bom.stages.map((stage) => {
    const view: BomStageView = {
      id: stage.id,
      name: stage.stageName,
      materials: stage.materials.map((m) => ({
        id: m.id,
        description: m.description,
        quantity: qty(m.quantity),
        unit: m.unit,
        ...(costing ? { cost: costing.materials[m.id] ?? null } : {}),
      })),
    };
    if (costing) {
      const c = costing.stages[stage.id];
      view.subtotal = c ? c.subtotal : null;
      view.unpriced = c ? c.unpriced : 0;
    }
    return view;
  });

  const key = bom.approvedAt ? factoryDateKey(bom.approvedAt, timeZone) : null;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    description: order.description ?? null,
    bomStatus: bom.status,
    approvedLabel: key ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : null,
    itemCount: stages.reduce((sum, s) => sum + s.materials.length, 0),
    stages,
    canCost,
    canEdit: can(actor.role, 'orders.write'),
    ...(costing ? { costing: { total: costing.total, priced: costing.priced, unpriced: costing.unpriced, isFloor: costing.isFloor } } : {}),
  };
}

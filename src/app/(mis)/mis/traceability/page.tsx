import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { TraceabilityScreen } from '@/components/mis/traceability/traceability-screen';

export default async function TraceabilityPage() {
  await requireMisAccess();
  const orders = (await listOrders()).filter((o: any) => !['DRAFT'].includes(o.status));
  return <TraceabilityScreen orders={orders as any[]} />;
}

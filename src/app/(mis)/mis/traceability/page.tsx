import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { TraceabilityScreen } from '@/components/mis/traceability/traceability-screen';
import { TraceabilityDesktopServer } from '@/components/mis/desktop/traceability-desktop-server';

export default async function TraceabilityPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const sp = await searchParams;
  await requireMisAccess();
  const orders = (await listOrders()).filter((o: any) => !['DRAFT'].includes(o.status));
  const phone = <TraceabilityScreen orders={orders as any[]} />;

  // D11 from 1024px up; the existing screen below it. ANY explicit `?view` is the existing screen at every width.
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <TraceabilityDesktopServer q={sp.q} />
      </div>
    </>
  );
}

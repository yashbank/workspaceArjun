import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { db } from '@/server/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function MachineHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();

  const machine = await db.misMachine.findUnique({
    where: { id },
    include: { department: { select: { name: true } } },
  });
  if (!machine) notFound();

  const rawAllocations = await db.misMachineAllocation.findMany({
    where: { machineId: id },
    include: {
      order: { select: { orderNumber: true } },
    },
    orderBy: { startsAt: 'desc' },
    take: 50,
  });

  // allocatedById has no formal relation (it isn't restricted to mis_employees),
  // so resolve the "allocated by" name with a small batch lookup instead.
  const allocatorIds = [...new Set(rawAllocations.map((a) => a.allocatedById).filter((v): v is string => !!v))];
  const allocators = allocatorIds.length
    ? await db.userProfile.findMany({ where: { id: { in: allocatorIds } }, select: { id: true, name: true } })
    : [];
  const allocatorById = new Map(allocators.map((p) => [p.id, p.name]));
  const allocations = rawAllocations.map((a) => ({
    ...a,
    allocatedBy: a.allocatedById ? { name: allocatorById.get(a.allocatedById) ?? '—' } : null,
  }));

  const now = new Date();
  const currentAlloc = allocations.find(a => a.startsAt <= now && a.endsAt >= now && !a.releasedAt);
  const status = currentAlloc ? 'BUSY' : machine.isActive ? 'FREE' : 'OFFLINE';
  const dotColor = status === 'FREE' ? 'bg-green-500' : status === 'BUSY' ? 'bg-red-500' : 'bg-slate-300';

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/mis/machine-board" className="hover:underline">Machine Board</Link>
        <span className="mx-2">&#x203A;</span>
        <span className="text-slate-800 font-medium">{machine.name}</span>
      </nav>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-3 h-3 rounded-full ${dotColor}`} />
          <h1 className="text-xl font-bold text-slate-900">{machine.name}</h1>
          <span className="font-mono text-sm text-slate-400">{machine.code}</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><span className="text-slate-500">Status</span><p className="font-medium text-slate-800 mt-0.5">{status}</p></div>
          <div><span className="text-slate-500">Department</span><p className="font-medium text-slate-800 mt-0.5">{machine.department?.name ?? '—'}</p></div>
          <div><span className="text-slate-500">Type</span><p className="font-medium text-slate-800 mt-0.5">{machine.machineType ?? '—'}</p></div>
        </div>
        {currentAlloc && (
          <div className="mt-4 bg-red-50 border border-red-100 rounded-lg p-3 text-sm">
            <span className="font-medium text-red-700">Currently allocated: </span>
            <span className="text-red-600">
              {currentAlloc.order?.orderNumber ?? currentAlloc.jobRef ?? 'Unknown job'}
              {' - until '}{new Date(currentAlloc.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </span>
          </div>
        )}
      </div>

      <div>
        <h2 className="font-semibold text-slate-700 mb-3">Allocation History</h2>
        {allocations.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-8">No allocation history.</div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {allocations.map((alloc) => {
              const isActive = alloc.startsAt <= now && alloc.endsAt >= now && !alloc.releasedAt;
              const wasReleased = !!alloc.releasedAt;
              const durationMs = (alloc.releasedAt ?? alloc.endsAt).getTime() - alloc.startsAt.getTime();
              const durationH = Math.round(durationMs / 3600000 * 10) / 10;
              return (
                <div key={alloc.id} className="flex items-center justify-between px-4 py-3 gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 text-sm">
                      {alloc.order?.orderNumber ?? alloc.jobRef ?? 'Manual job'}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {new Date(alloc.startsAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                      {' to '}
                      {alloc.releasedAt
                        ? new Date(alloc.releasedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
                        : new Date(alloc.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      {' - '}{durationH}h
                    </div>
                    {alloc.allocatedBy && <div className="text-xs text-slate-400 mt-0.5">By {alloc.allocatedBy.name}</div>}
                    {alloc.notes && <div className="text-xs text-slate-400 mt-0.5 italic">{alloc.notes}</div>}
                  </div>
                  <div className="flex-shrink-0">
                    {isActive ? (
                      <span className="text-xs bg-red-100 text-red-700 font-medium rounded-full px-2.5 py-0.5">Active</span>
                    ) : wasReleased ? (
                      <span className="text-xs bg-green-100 text-green-700 rounded-full px-2.5 py-0.5">Released</span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2.5 py-0.5">Completed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

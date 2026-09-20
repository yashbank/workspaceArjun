import { notFound } from 'next/navigation';

import { SignOffScreen } from '@/components/mis/production/sign-off-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { getSignOffSummary, isJobPhaseError } from '@/server/mis/job-phases';
import { db } from '@/server/db';

export default async function SignOffPage({ params }: { params: Promise<{ phaseId: string }> }) {
  const { phaseId } = await params;
  await requireMisAccess();

  const summary = await getSignOffSummary(phaseId).catch((error) => {
    if (isJobPhaseError(error) && error.reason === 'PHASE_NOT_FOUND') return null;
    throw error;
  });
  if (!summary) notFound();

  const phase = await db.misJobPhase.findUnique({
    where: { id: phaseId },
    select: { orderId: true },
  });
  if (!phase) notFound();

  return (
    <SignOffScreen
      phaseId={summary.phaseId}
      processName={summary.processName}
      orderId={phase.orderId}
      orderNumber={summary.orderNumber}
      status={summary.status}
      inChargeName={summary.inChargeName}
      canSign={summary.canSign}
      output={summary.output}
      waste={summary.waste}
      wastePercent={summary.wastePercent}
      entries={summary.entries}
      unit={summary.unit}
      handedOver={summary.handedOver}
      materials={summary.materials}
      blockers={summary.blockers.map((b) =>
        b.kind === 'WASTE_REASON'
          ? { ...b, loggedAt: b.loggedAt.toISOString() }
          : b.kind === 'QC_FAILURE'
            ? { ...b, checkTime: b.checkTime.toISOString() }
            : b,
      )}
    />
  );
}

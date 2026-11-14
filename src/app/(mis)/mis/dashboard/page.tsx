import { format } from 'date-fns';

import { DashboardScreen } from '@/components/mis/desktop/dashboard-screen';
import type { DashboardData } from '@/components/mis/desktop/widgets';
import { getPendingApprovals } from '@/server/mis/approvals';
import { getDayAttendanceSummary } from '@/server/mis/attendance';
import { getDashboardCatalogue, getDashboardLayout } from '@/server/mis/dashboard';
import { requireMisAccess } from '@/server/mis/guard';
import { getMachineStatusCounts } from '@/server/mis/machines-board';
import { listOrdersNeedingAction, listRecentlyDespatchedOrders } from '@/server/mis/orders';
import { getMonthWageBill } from '@/server/mis/payroll';
import { countPhasesForOrders } from '@/server/mis/job-phases';
import { getBomPipeline, getLowStockAlerts, getPoFulfilment } from '@/server/mis/dashboard-widgets';
import { getRangeOnTime, getRangeProduction, getRangeQc, getRangeScrapRate } from '@/server/mis/range-metrics';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { factoryDateKey } from '@/lib/mis/factory-time';
import { resolveRange } from '@/lib/mis/report-range';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { getCrewSummary } from '@/server/mis/worker-allocation';
import { shortAge } from '@/lib/mis/relative-age';

import { resetDashboardLayoutAction, saveDashboardLayoutAction } from './actions';

/**
 * The desktop dashboard (D1).
 *
 * A SECOND VIEW OF THE SAME DATA, never a second data path: every figure below comes from a
 * server function the phone layer already uses. Nothing here queries a table directly.
 *
 * Only what the layout actually shows is fetched. That is not just an optimisation — it is
 * how D24 stays true at the page level: `getMonthWageBill` is gated on `wages.read` and
 * would throw for anyone else, so it is called only when the money widget survived the
 * role-filtered layout. A non-owner's page never asks for a wage at all.
 */
function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function MisDashboardPage({ searchParams }: { searchParams: Promise<{ freq?: string; at?: string }> }) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);

  const [layout, catalogue] = await Promise.all([getDashboardLayout(), getDashboardCatalogue()]);
  const shown = new Set(layout.map((p) => p.widgetKey));
  const needs = (...keys: string[]) => keys.some((key) => shown.has(key));

  const now = new Date();
  // R8 T4: one range (?freq=&at=) drives the output, wastage, QC and on-time widgets; reports read the same params.
  const range = resolveRange(await searchParams, factoryDateKey(now, await getFactoryTimezone()));
  const monthEnd = new Date(`${range.toKey}T00:00:00Z`);
  monthEnd.setUTCDate(monthEnd.getUTCDate() - 1);

  const [range_, machines, approvals, attendance, crew, orders, onTimeRaw, qcRange, wages, lowStock, poFulfilment, bomPipeline, scrapTrend] = await Promise.all([
    needs('output.yesterday', 'wastage.yesterday', 'output.againstPlan', 'wastage.byPhase') ? getRangeProduction(range) : null,
    needs('machines.running', 'machines.board') ? getMachineStatusCounts() : null,
    needs('orders.waitingOnYou') ? getPendingApprovals() : null,
    // A past day shows that day's attendance; any longer range shows today (a head count is a point in time).
    needs('people.attendanceToday') ? getDayAttendanceSummary(range.freq === 'day' ? range.at : undefined) : null,
    needs('people.crewToday') ? getCrewSummary() : null,
    needs('orders.inFlight') ? listOrdersNeedingAction(20) : [],
    needs('orders.onTime') ? getRangeOnTime(range) : null,
    needs('qc.aqlThisMonth', 'qc.defectsOpen') ? getRangeQc(range) : null,
    // Owner only, by construction: the widget is in the layout only if the role holds
    // wages.read, and the function refuses anyone else anyway (D24, F-01's fix). Wages stay a
    // calendar-month figure: the month the range ends in.
    shown.has('money.wagesAccrued') ? getMonthWageBill(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() + 1) : null,
    // R2-411..414: opt-in widgets, fetched only when placed (and only placeable by a role holding their permission).
    shown.has('stock.lowAlerts') ? getLowStockAlerts() : null,
    shown.has('po.fulfilment') ? getPoFulfilment() : null,
    shown.has('bom.pipeline') ? getBomPipeline() : null,
    shown.has('wastage.scrapTrend') ? getRangeScrapRate(range) : null,
  ]);

  // R2-409: in-flight orders stay exactly as before; recently despatched ones only fill spare
  // slots of the widget's five rows, so the green "Despatched" state is reachable.
  const inFlight = orders.slice(0, 6);
  const spare = needs('orders.inFlight') ? Math.max(0, 5 - inFlight.length) : 0;
  const despatched = spare > 0 ? await listRecentlyDespatchedOrders(spare) : [];
  const shownOrders = [...inFlight, ...despatched];
  const phaseCounts = shownOrders.length > 0 && can(role, 'phase.read') ? await countPhasesForOrders(shownOrders.map((o) => o.id)) : new Map();
  const elapsed = monthEnd.getUTCFullYear() === now.getFullYear() && monthEnd.getUTCMonth() === now.getMonth();
  const daysInMonth = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() + 1, 0)).getUTCDate();

  const data: DashboardData = {
    production: range_ ? { produced: range_.produced, waste: range_.waste, machinesRun: range_.machinesRun, entries: range_.entries } : null,
    series: range_?.series ?? [],
    seriesUnit: range_?.seriesUnit ?? undefined,
    rangeLabel: range.label,
    // No plan figure is recorded anywhere yet, so the plan line is absent rather than
    // invented. A guessed plan would make the chart lie about whether the factory is behind.
    plan: null,
    machines: machines ? { free: machines.free, running: machines.running, down: machines.down, total: machines.total } : null,
    attendance: attendance
      ? {
          headcount: attendance.headcount,
          present: attendance.present,
          late: attendance.late,
          onLeave: attendance.onLeave,
          absent: attendance.absent,
        }
      : null,
    crew,
    approvals: approvals
      ? {
          total: approvals.total,
          rows: [
            ...approvals.boms.map((b) => ({
              id: `bom-${b.id}`,
              title: `BOM for ${b.order?.orderNumber ?? 'an order'}`,
              detail: b.order?.description ?? 'No description',
              age: shortAge(b.updatedAt, now),
            })),
            ...approvals.pos.map((p) => ({
              id: `po-${p.id}`,
              title: p.poNumber,
              detail: p.supplier?.name ?? 'No supplier',
              age: shortAge(p.createdAt, now),
            })),
          ],
        }
      : null,
    orders: shownOrders.map((o) => {
      const phases = phaseCounts.get(o.id) ?? { done: 0, total: 0 };
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        done: phases.done,
        total: phases.total,
        late: Boolean(o.lateRisk),
        despatched: o.status === 'DELIVERED',
      };
    }),
    // No "on time" timestamp is recorded, so this is delivered over due so far in the range.
    onTime:
      onTimeRaw && onTimeRaw.total > 0
        ? { pct: Math.round((onTimeRaw.despatched / onTimeRaw.total) * 100), target: 95, despatched: onTimeRaw.despatched, total: onTimeRaw.total }
        : null,
    wastageByPhase: range_?.wastageByPhase ?? [],
    qc: qcRange?.aql ?? null,
    defectsOpen: qcRange ? qcRange.defectsOpen : null,
    lowStock,
    poFulfilment,
    bomPipeline,
    scrapTrend,
    wages: wages
      ? {
          gross: wages.gross,
          ot: wages.ot,
          monthLabel: format(new Date(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth(), 1), 'MMMM'),
          elapsedPct: elapsed ? Math.round((now.getDate() / daysInMonth) * 100) : 100,
        }
      : null,
  };

  return (
    <DashboardScreen
      role={role}
      initialLayout={layout}
      catalogue={catalogue}
      data={data}
      onSave={saveDashboardLayoutAction}
      onReset={resetDashboardLayoutAction}
      range={range}
      header={{ title: greeting(now), meta: format(now, 'EEEE, d MMMM · HH:mm') }}
    />
  );
}

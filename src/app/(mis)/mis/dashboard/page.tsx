import { format } from 'date-fns';

import { DashboardScreen } from '@/components/mis/desktop/dashboard-screen';
import type { DashboardData } from '@/components/mis/desktop/widgets';
import { getPendingApprovals } from '@/server/mis/approvals';
import { getDayAttendanceSummary } from '@/server/mis/attendance';
import { getDashboardCatalogue, getDashboardLayout } from '@/server/mis/dashboard';
import { requireMisAccess } from '@/server/mis/guard';
import { getMachineStatusCounts } from '@/server/mis/machines-board';
import { listOrdersNeedingAction } from '@/server/mis/orders';
import { getMonthWageBill } from '@/server/mis/payroll';
import { countPhasesForOrders } from '@/server/mis/job-phases';
import { getDayProductionSummary, getProductionSeries } from '@/server/mis/production';
import { getMisRole } from '@/server/mis/roles';
import { getCrewSummary } from '@/server/mis/worker-allocation';

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
export default async function MisDashboardPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);

  const [layout, catalogue] = await Promise.all([getDashboardLayout(), getDashboardCatalogue()]);
  const shown = new Set(layout.map((p) => p.widgetKey));
  const needs = (...keys: string[]) => keys.some((key) => shown.has(key));

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const [production, series, machines, approvals, attendance, crew, orders, wages] = await Promise.all([
    needs('output.yesterday', 'wastage.yesterday') ? getDayProductionSummary(yesterday) : null,
    needs('output.yesterday', 'wastage.yesterday', 'output.againstPlan') ? getProductionSeries(14, yesterday) : [],
    needs('machines.running', 'machines.board') ? getMachineStatusCounts() : null,
    needs('orders.waitingOnYou') ? getPendingApprovals() : null,
    needs('people.attendanceToday') ? getDayAttendanceSummary() : null,
    needs('people.crewToday') ? getCrewSummary() : null,
    needs('orders.inFlight', 'orders.onTime') ? listOrdersNeedingAction(20) : [],
    // Owner only, by construction: the widget is in the layout only if the role holds
    // wages.read, and the function refuses anyone else anyway (D24, F-01's fix).
    shown.has('money.wagesAccrued') ? getMonthWageBill(now.getFullYear(), now.getMonth() + 1) : null,
  ]);

  const shownOrders = orders.slice(0, 6);
  const phaseCounts = shownOrders.length > 0 ? await countPhasesForOrders(shownOrders.map((o) => o.id)) : new Map();
  const despatched = orders.filter((o) => o.status === 'DESPATCHED' || o.status === 'COMPLETED').length;
  const daysInMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).getUTCDate();

  const data: DashboardData = {
    production,
    series: series.map((d) => ({ date: format(d.date, 'd MMM'), produced: d.produced, waste: d.waste })),
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
            })),
            ...approvals.pos.map((p) => ({
              id: `po-${p.id}`,
              title: p.poNumber,
              detail: p.supplier?.name ?? 'No supplier',
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
        despatched: o.status === 'DESPATCHED' || o.status === 'COMPLETED',
      };
    }),
    onTime:
      orders.length > 0
        ? { pct: Math.round((despatched / orders.length) * 100), target: 95, despatched, total: orders.length }
        : null,
    // Both need a query that does not exist yet; the widgets show their honest empty state
    // rather than a zero (D2). 24.4 builds the screens these come from (D14, D9).
    wastageByPhase: [],
    qc: null,
    defectsOpen: null,
    wages: wages
      ? {
          gross: wages.gross,
          ot: wages.ot,
          monthLabel: format(now, 'MMMM'),
          elapsedPct: Math.round((now.getDate() / daysInMonth) * 100),
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
    />
  );
}

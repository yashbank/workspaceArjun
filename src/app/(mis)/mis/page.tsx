import { format, formatDistanceToNow } from 'date-fns';

import { AdminHome } from '@/components/mis/home/admin-home';
import { AttendanceHome } from '@/components/mis/home/attendance-home';
import { OwnerHome, type OwnerAlert } from '@/components/mis/home/owner-home';
import { QcHome, type QcSlotView } from '@/components/mis/home/qc-home';
import { StoreHome } from '@/components/mis/home/store-home';
import { SupervisorHome } from '@/components/mis/home/supervisor-home';
import type { MisRoleName } from '@/lib/mis/roles';
import { getPendingApprovals } from '@/server/mis/approvals';
import {
  getAttendanceCorrectionWindow,
  getCurrentShiftName,
  getDayAttendanceSummary,
} from '@/server/mis/attendance';
import { listOpenGRNs } from '@/server/mis/grn';
import { listPhasesAwaitingMySignOff } from '@/server/mis/job-phases';
import { requireMisAccess } from '@/server/mis/guard';
import { getMachineStatusCounts } from '@/server/mis/machines-board';
import { countMastersMissingHindiName } from '@/server/mis/master-option';
import { listOrdersNeedingAction } from '@/server/mis/orders';
import { getMonthWageBill } from '@/server/mis/payroll';
import { getDayProductionSummary } from '@/server/mis/production';
import { findLineClearanceBlocker } from '@/server/mis/line-clearance';
import { getTodayQcBoard, listRecentQcFailures } from '@/server/mis/qc';
import { getMisRole } from '@/server/mis/roles';
import { getKioskHealthSummary } from '@/server/mis/kiosk-device';
import { toKioskCard } from '@/lib/mis/kiosk-health';
import { getStoreDashboard } from '@/server/mis/store';
import { getCrewSummary } from '@/server/mis/worker-allocation';

/**
 * The role home.
 *
 * A thin server component: resolve who is looking, fetch exactly what that
 * role's cards need, hand it to one client component. No role reaches for data
 * another role's cards use — most of all the wage bill, which is fetched only
 * on the OWNER branch and is therefore absent from the other five payloads
 * rather than hidden inside them.
 */
export default async function MisHomePage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const person = user.name ?? user.email;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const meta = `${format(now, 'EEE d MMM · HH:mm')} · ${person}`;
  const ago = (d: Date) => formatDistanceToNow(d, { addSuffix: true });

  switch (role) {
    case 'OWNER':
      return <OwnerScreen header={{ title: greeting(now), meta }} now={now} yesterday={yesterday} ago={ago} />;
    case 'ADMIN':
      return <AdminScreen header={{ title: 'Office', meta }} />;
    case 'SUPERVISOR':
      return <SupervisorScreen meta={meta} ago={ago} />;
    case 'QC':
      return <QcScreenHome meta={meta} ago={ago} />;
    case 'ATTENDANCE_OPERATOR':
    case 'SUPER_ATTENDANCE_OPERATOR':
      return <AttendanceScreen role={role} header={{ title: 'Attendance', meta }} yesterday={yesterday} ago={ago} />;
    case 'STORE_GUY':
      return <StoreScreen header={{ title: 'Store', meta }} ago={ago} />;
    default:
      return <NoRoleScreen person={person} />;
  }
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const hhmm = (d: Date) => format(d, 'HH:mm');

async function OwnerScreen({
  header,
  now,
  yesterday,
  ago,
}: {
  header: { title: string; meta: string };
  now: Date;
  yesterday: Date;
  ago: (d: Date) => string;
}) {
  const [approvals, machines, failures, lateOrders, dayBefore, wages] = await Promise.all([
    getPendingApprovals(),
    getMachineStatusCounts(),
    listRecentQcFailures(3),
    listOrdersNeedingAction(5),
    getDayProductionSummary(yesterday),
    getMonthWageBill(now.getFullYear(), now.getMonth() + 1),
  ]);

  const approvalRows = [
    ...approvals.boms.map((b) => ({
      id: `bom-${b.id}`,
      title: `BOM for ${b.order?.orderNumber ?? 'an order'}`,
      detail: `${b.order?.description ?? 'No description'} · waiting since ${ago(b.updatedAt)}`,
    })),
    ...approvals.pos.map((p) => ({
      id: `po-${p.id}`,
      title: `${p.poNumber} · ${p.supplier?.name ?? 'No supplier'}`,
      detail: `Purchase order raised ${ago(p.createdAt)}`,
    })),
    ...approvals.leaves.map((l) => ({
      id: `leave-${l.id}`,
      title: `Leave for ${l.employee?.name ?? 'an employee'}`,
      detail: `${format(l.date, 'd MMM')} · ${l.reason ?? 'No reason given'}`,
    })),
  ].slice(0, 2);

  const alerts: OwnerAlert[] = [
    ...machines.downMachines.map((m) => ({
      id: `machine-${m.id}`,
      tone: 'stopped' as const,
      title: `${m.name} is down`,
      detail: `${m.code} is switched off — nothing can be scheduled on it.`,
      href: '/mis/machine-board',
    })),
    ...failures.map((f) => ({
      id: `qc-${f.id}`,
      tone: 'stopped' as const,
      title: `${f.orderNumber} failed ${f.parameterName}`,
      detail: `${f.defectType ?? 'Failure'} logged at ${hhmm(f.checkTime)}${f.notes ? ` · ${f.notes}` : ''}`,
      href: `/mis/qc/${f.orderId}`,
    })),
    ...lateOrders
      .filter((o) => o.lateRisk)
      .map((o) => ({
        id: `order-${o.id}`,
        tone: 'risk' as const,
        title: `${o.orderNumber} · ${o.customerName ?? 'No customer'}`,
        detail:
          o.daysToDelivery !== null && o.daysToDelivery < 0
            ? `Delivery was ${Math.abs(o.daysToDelivery)} days ago — ${o.nextAction.toLowerCase()}`
            : `Due in ${o.daysToDelivery} days — ${o.nextAction.toLowerCase()}`,
        href: `/mis/orders/${o.id}`,
      })),
  ].slice(0, 5);

  return (
    <OwnerHome
      header={header}
      approvals={{ total: approvals.total, rows: approvalRows }}
      alerts={alerts}
      yesterday={{
        label: `Yesterday · ${format(yesterday, 'EEE d MMM')}`,
        produced: Math.round(dayBefore.produced),
        waste: Math.round(dayBefore.waste),
        machinesRun: dayBefore.machinesRun,
        recorded: dayBefore.entries > 0,
      }}
      wages={{
        monthLabel: format(now, 'MMMM'),
        gross: wages.gross,
        ot: wages.ot,
        headcount: wages.headcount,
      }}
    />
  );
}

async function AdminScreen({
  header,
}: {
  header: { title: string; meta: string };
}) {
  const [orders, attendance, hindiGap] = await Promise.all([
    listOrdersNeedingAction(4),
    getDayAttendanceSummary(),
    countMastersMissingHindiName(),
  ]);

  return (
    <AdminHome
      header={header}
      orders={orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        nextAction: o.nextAction,
        lateRisk: o.lateRisk,
      }))}
      attendance={{
        present: attendance.present,
        headcount: attendance.headcount,
        recorded: attendance.recorded,
      }}
      hindiGap={{ total: hindiGap.total }}
    />
  );
}

async function SupervisorScreen({
  meta,
  ago,
}: {
  meta: string;
  ago: (d: Date) => string;
}) {
  const [shift, failures, clearanceBlocker, machines, signOff, crew] = await Promise.all([
    getCurrentShiftName(),
    listRecentQcFailures(1),
    findLineClearanceBlocker(),
    getMachineStatusCounts(),
    listPhasesAwaitingMySignOff(3),
    // Pool-scoped (D4/D5), unlike getDayAttendanceSummary's factory-wide count
    // used elsewhere on this page — "My crew today" means the supervisor's
    // own subtree, not the whole register (Phase 8).
    getCrewSummary(),
  ]);

  const blocker = failures[0]
    ? {
        orderId: failures[0].orderId,
        orderNumber: failures[0].orderNumber,
        parameterName: failures[0].parameterName,
        defectType: failures[0].defectType,
        since: `raised ${ago(failures[0].checkTime)}`,
      }
    : null;

  return (
    <SupervisorHome
      header={{ title: shift ? `Production · ${shift}` : 'Production', meta }}
      clearanceBlocker={clearanceBlocker}
      blocker={blocker}
      machines={machines}
      signOff={{
        total: signOff.total,
        rows: signOff.rows.map((r) => ({
          id: r.id,
          processName: r.process.name,
          orderNumber: r.order.orderNumber,
          detail: r.startedAt
            ? `Running since ${format(r.startedAt, 'd MMM, HH:mm')}${r.status === 'REOPENED' ? ' · reopened' : ''}`
            : 'Not started yet',
        })),
      }}
      crew={{
        present: crew.present,
        headcount: crew.headcount,
        absent: crew.absent,
        onLeave: crew.onLeave,
        recorded: crew.recorded,
      }}
    />
  );
}

async function QcScreenHome({
  meta,
  ago,
}: {
  meta: string;
  ago: (d: Date) => string;
}) {
  const [shift, board] = await Promise.all([getCurrentShiftName(), getTodayQcBoard()]);

  const slots: QcSlotView[] = board.slots.map((s) => ({
    hour: s.hour,
    label: s.label,
    state: s.state,
  }));

  return (
    <QcHome
      header={{ title: shift ? `Quality · ${shift}` : 'Quality', meta }}
      due={board.dueSlot}
      slots={slots}
      failures={board.failures.map((f) => ({
        id: f.id,
        orderId: f.orderId,
        orderNumber: f.orderNumber,
        parameterName: f.parameterName,
        detail: `${f.defectType ?? 'Failure'}${f.defectQty !== null ? ` · ${f.defectQty}` : ''} · ${ago(f.checkTime)}`,
      }))}
      alsoToday={board.alsoToday.map((c) => ({
        id: c.id,
        orderId: c.orderId,
        orderNumber: c.orderNumber,
        parameterName: c.parameterName,
        result: c.result,
        time: hhmm(c.checkTime),
      }))}
    />
  );
}

async function AttendanceScreen({
  role,
  header,
  yesterday,
  ago,
}: {
  role: MisRoleName;
  header: { title: string; meta: string };
  yesterday: Date;
  ago: (d: Date) => string;
}) {
  const isSuper = role === 'SUPER_ATTENDANCE_OPERATOR';
  const [today, prev, corrections, kioskSummary] = await Promise.all([
    getDayAttendanceSummary(),
    getDayAttendanceSummary(format(yesterday, 'yyyy-MM-dd')),
    isSuper ? getAttendanceCorrectionWindow() : Promise.resolve(null),
    getKioskHealthSummary(),
  ]);

  const punchesToday = today.present;

  return (
    <AttendanceHome
      header={header}
      isSuper={isSuper}
      kiosk={{
        lastPunch: today.lastPunchAt ? ago(today.lastPunchAt) : null,
        punchesToday,
        health: toKioskCard(kioskSummary, new Date()),
      }}
      today={{
        present: today.present,
        headcount: today.headcount,
        late: today.late,
        onLeave: today.onLeave,
        absent: today.absent,
        recorded: today.recorded,
      }}
      forgotClockOut={{
        label: `on ${format(yesterday, 'EEE d MMM')}`,
        people: prev.notClockedOut.slice(0, 4).map((p) => ({
          id: p.id,
          name: `${p.name} · ${p.employeeCode}`,
          detail: p.clockIn ? `Clocked in ${hhmm(p.clockIn)}, never clocked out` : 'Never clocked out',
        })),
      }}
      lateArrivals={today.lateArrivals.map((p) => ({
        id: p.id,
        name: p.name,
        employeeCode: p.employeeCode,
        detail: `${p.lateMinutes} min late${p.clockIn ? ` · clocked in ${hhmm(p.clockIn)}` : ''}`,
      }))}
      corrections={
        corrections
          ? {
              label: `${format(corrections.from, 'd MMM')} – ${format(corrections.to, 'd MMM')}`,
              days: corrections.days,
            }
          : null
      }
    />
  );
}

async function StoreScreen({
  header,
  ago,
}: {
  header: { title: string; meta: string };
  ago: (d: Date) => string;
}) {
  const [store, grns] = await Promise.all([getStoreDashboard(), listOpenGRNs(4)]);

  return (
    <StoreHome
      header={header}
      stock={{
        lowStockCount: store.lowStockCount,
        outOfStockCount: store.outOfStockCount,
        totalItems: store.totalItems,
      }}
      movement={{ todayIn: store.todayIn, todayOut: store.todayOut }}
      openGrns={{
        total: grns.total,
        rows: grns.rows.map((g) => ({
          id: g.id,
          grnNumber: g.grnNumber,
          poNumber: g.poNumber,
          supplierName: g.supplierName,
          age: ago(g.createdAt),
        })),
      }}
    />
  );
}

/** Signed in, flagged in, but no MIS employee record — a real state, not an error. */
function NoRoleScreen({ person }: { person: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">Not on the register</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{person}</p>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="font-semibold text-slate-900">No MIS role has been assigned to this account.</p>
        <p className="text-sm text-slate-600">Ask the office to add you to the employee register.</p>
      </section>
    </div>
  );
}

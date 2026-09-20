import { allowedActions, type MisAction } from '@/lib/mis/permissions';
import type { TranslationKey } from '@/lib/mis/i18n';

import type { MisRoleName } from '@/lib/mis/roles';

import { getMisRole } from './roles';

export type NavIcon =
  | 'database'
  | 'clipboard'
  | 'factory'
  | 'check'
  | 'users'
  | 'chart'
  | 'settings'
  | 'wrench';

export type NavEntry = {
  id: string;
  labelKey: TranslationKey;
  href: string;
  icon: NavIcon;
  /** Shown in the mobile bottom bar. At most five ever are. */
  primary: boolean;
};

type NavDefinition = NavEntry & { requires: MisAction };

const NAV: NavDefinition[] = [
  { id: 'masters', labelKey: 'nav.masters', href: '/mis/masters', icon: 'database', primary: true, requires: 'masters.read' },
  { id: 'orders', labelKey: 'nav.orders', href: '/mis/orders', icon: 'clipboard', primary: true, requires: 'orders.read' },
  { id: 'production', labelKey: 'nav.production', href: '/mis/production', icon: 'factory', primary: true, requires: 'production.read' },
  { id: 'quality', labelKey: 'nav.quality', href: '/mis/qc', icon: 'check', primary: true, requires: 'qc.read' },
  { id: 'attendance', labelKey: 'nav.attendance', href: '/mis/attendance', icon: 'users', primary: true, requires: 'attendance.read' },
  { id: 'machine-board', labelKey: 'nav.machines', href: '/mis/machine-board', icon: 'wrench', primary: false, requires: 'production.read' },
  { id: 'reports', labelKey: 'nav.reports', href: '/mis/reports', icon: 'chart', primary: false, requires: 'reports.read' },
  { id: 'settings', labelKey: 'nav.settings', href: '/mis/settings', icon: 'settings', primary: false, requires: 'settings.read' },
  // Phase 2 additions
  { id: 'employees', labelKey: 'nav.employees', href: '/mis/employees', icon: 'users', primary: false, requires: 'employees.read' },
  { id: 'po', labelKey: 'nav.po', href: '/mis/po', icon: 'clipboard', primary: false, requires: 'po.read' },
  { id: 'grn', labelKey: 'nav.grn', href: '/mis/grn', icon: 'database', primary: false, requires: 'grn.read' },
  { id: 'inventory', labelKey: 'nav.inventory', href: '/mis/inventory', icon: 'database', primary: false, requires: 'inventory.read' },
  { id: 'customers', labelKey: 'nav.customers', href: '/mis/customers', icon: 'users', primary: false, requires: 'orders.read' },
  { id: 'suppliers', labelKey: 'nav.suppliers', href: '/mis/suppliers', icon: 'users', primary: false, requires: 'po.read' },
  { id: 'documents', labelKey: 'nav.documents', href: '/mis/documents', icon: 'clipboard', primary: false, requires: 'orders.read' },
  { id: 'bom', labelKey: 'nav.bom', href: '/mis/bom', icon: 'database', primary: false, requires: 'orders.read' },
  { id: 'traceability', labelKey: 'nav.traceability', href: '/mis/traceability', icon: 'chart', primary: false, requires: 'orders.read' },
  { id: 'approvals', labelKey: 'nav.approvals', href: '/mis/approvals', icon: 'check', primary: false, requires: 'orders.read' },
  { id: 'kiosk', labelKey: 'nav.kiosk', href: '/mis/kiosk', icon: 'users', primary: false, requires: 'attendance.write' },
  { id: 'audit', labelKey: 'nav.audit', href: '/mis/audit', icon: 'clipboard', primary: false, requires: 'settings.read' },
  { id: 'payroll', labelKey: 'nav.payroll', href: '/mis/payroll', icon: 'chart', primary: false, requires: 'wages.read' },
  { id: 'store', labelKey: 'nav.store', href: '/mis/store', icon: 'database', primary: false, requires: 'store.read' },
];

/** The bottom bar holds five at most; a sixth thumb target does not fit at 360px. */
export const MAX_PRIMARY_NAV = 5;

export async function getNavigationFor(userId: string): Promise<NavEntry[]> {
  const role = await getMisRole(userId);
  const permitted = new Set<MisAction>(allowedActions(role));
  return NAV.filter((entry) => permitted.has(entry.requires)).map(
    ({ requires: _requires, ...entry }) => entry,
  );
}

export function splitNavigation(entries: NavEntry[]): { primary: NavEntry[]; overflow: NavEntry[] } {
  const primary = entries.filter((e) => e.primary).slice(0, MAX_PRIMARY_NAV);
  const primaryIds = new Set(primary.map((e) => e.id));
  return { primary, overflow: entries.filter((e) => !primaryIds.has(e.id)) };
}

/**
 * The numbers on the bottom bar, keyed by tab id.
 *
 * One call per page load, made in the MIS layout so no screen has to remember
 * to compute them. Every branch reuses a function that already exists — a badge
 * is a count of something a card elsewhere already shows, never its own query.
 *
 * A badge is decoration: if a permission or a table is missing the whole thing
 * degrades to no badges rather than taking the page down with it.
 */
export async function getNavBadges(
  userId: string,
  role?: MisRoleName | null,
): Promise<Record<string, number>> {
  const resolved = role === undefined ? await getMisRole(userId) : role;
  if (!resolved) return {};

  try {
    switch (resolved) {
      case 'OWNER': {
        const { getPendingApprovals } = await import('./approvals');
        const approvals = await getPendingApprovals();
        return { approvals: approvals.total };
      }
      case 'ADMIN': {
        const { listOrdersNeedingAction } = await import('./orders');
        const orders = await listOrdersNeedingAction(20);
        return { orders: orders.filter((o) => o.lateRisk).length };
      }
      case 'SUPERVISOR': {
        // The Crew tab now opens the worker board (Phase 8), so its badge is
        // free hands right now, not clock-out approvals — that count moved
        // with the sign-off card to the home screen (Phase 7).
        const { listShifts } = await import('./attendance');
        const { getWorkerAvailability } = await import('./worker-allocation');
        const { resolveShiftAt } = await import('@/lib/mis/shift-window');
        const shifts = await listShifts();
        const { getFactoryTimezone } = await import('./business-rules');
        const shift = resolveShiftAt(shifts, new Date(), await getFactoryTimezone());
        if (!shift) return { crew: 0 };
        const availability = await getWorkerAvailability(shift.id, new Date());
        return { crew: availability.filter((w) => !w.allocation).length };
      }
      case 'QC': {
        const { getTodayQcBoard } = await import('./qc');
        const board = await getTodayQcBoard();
        return { defects: board.failures.length };
      }
      case 'ATTENDANCE_OPERATOR':
      case 'SUPER_ATTENDANCE_OPERATOR': {
        const { getDayAttendanceSummary } = await import('./attendance');
        const today = await getDayAttendanceSummary();
        return { register: today.notClockedOut.length };
      }
      case 'STORE_GUY': {
        const [{ listOpenGRNs }, { getStoreDashboard }] = await Promise.all([
          import('./grn'),
          import('./store'),
        ]);
        const [grns, store] = await Promise.all([listOpenGRNs(1), getStoreDashboard()]);
        return { receive: grns.total, stock: store.lowStockCount };
      }
      default:
        return {};
    }
  } catch {
    return {};
  }
}

/**
 * V2 — what a MIS notification row says on the bell, by type. Owner/Admin/Store Guy only
 * (`server/mis/notifications.ts` decides who is served); this just turns a payload into words.
 *
 * Pure: no Prisma, no React.
 */

// R2-67: the Supervisor hears when the Store decides their material request, so the bell now serves them too.
export const MIS_NOTIFY_ROLES = ['OWNER', 'ADMIN', 'STORE_GUY', 'SUPERVISOR'] as const;
export type MisNotifyRole = (typeof MIS_NOTIFY_ROLES)[number];

export function isMisNotifyRole(role: string | null | undefined): role is MisNotifyRole {
  return (MIS_NOTIFY_ROLES as readonly string[]).includes(role ?? '');
}

export const NOTIFICATION_TYPES = {
  grnConfirmed: 'mis.grn_confirmed',
  requestRaised: 'mis.material_request.raised',
  bomRejected: 'mis.bom_rejected',
  // R2-67 — the Store decided a Supervisor's material request.
  requestDecided: 'mis.material_request.decided',
  // R2-80/62/Q11 — an issue / request raised as General / factory use (no order): Owner + Admin are told.
  generalUse: 'mis.general_use',
  // R2-212 — a clock-out recorded long overtime; the Supervisor is told (minutes only, no wage figure).
  longOvertime: 'mis.long_overtime',
  // R2-222 - a worker asked for a missed punch to be fixed / a supervisor decided it. No wage data in either payload.
  regularizationRaised: 'mis.punch_regularization.raised',
  regularizationDecided: 'mis.punch_regularization.decided',
} as const;

export type NotificationView = { title: string; detail: string; href: string; tone: 'info' | 'risk' | 'ok' };

type Payload = Record<string, unknown>;
const str = (p: Payload, k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
const num = (p: Payload, k: string) => (typeof p[k] === 'number' ? (p[k] as number) : 0);

/** Null for a type the bell does not know — the row is skipped, never shown as "undefined". */
export function notificationView(type: string, payload: unknown): NotificationView | null {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Payload;
  switch (type) {
    case NOTIFICATION_TYPES.grnConfirmed: {
      const totals = (p.totals ?? {}) as Payload;
      const lines = Array.isArray(p.lines) ? p.lines.length : 0;
      const parts = [`${lines} ${lines === 1 ? 'line' : 'lines'}`, `${num(totals, 'received')} of ${num(totals, 'ordered')} received`];
      if (num(totals, 'short') > 0) parts.push(`${num(totals, 'short')} short`);
      if (num(totals, 'damaged') > 0) parts.push(`${num(totals, 'damaged')} damaged`);
      return {
        title: `${str(p, 'grnNumber')} received · ${str(p, 'poNumber')}${str(p, 'supplierName') ? ` · ${str(p, 'supplierName')}` : ''}`,
        detail: parts.join(' · '),
        href: `/mis/grn/${str(p, 'grnId')}`,
        tone: p.attention ? 'risk' : 'info',
      };
    }
    case NOTIFICATION_TYPES.requestRaised:
      return {
        title: `${str(p, 'requestNumber')} · material requested`,
        detail: `${num(p, 'lineCount')} ${num(p, 'lineCount') === 1 ? 'line' : 'lines'}${str(p, 'orderNumber') ? ` · for ${str(p, 'orderNumber')}` : ''}${str(p, 'departmentName') ? ` · ${str(p, 'departmentName')}` : ''} · waiting for the Store`,
        href: `/mis/store/requests/${str(p, 'requestId')}`,
        tone: 'info',
      };
    case NOTIFICATION_TYPES.requestDecided: {
      const approved = str(p, 'decision') === 'APPROVED';
      return {
        title: `${str(p, 'requestNumber')} · ${approved ? 'approved' : 'rejected'} by the Store`,
        detail: approved
          ? `${str(p, 'note') || 'Your material request was approved'}${str(p, 'pickList') ? ' · a pick list is being prepared' : ''}`
          : str(p, 'note') || 'Your material request was rejected',
        href: `/mis/store/requests/${str(p, 'requestId')}`,
        tone: approved ? 'ok' : 'risk',
      };
    }
    case NOTIFICATION_TYPES.generalUse:
      return {
        title: `${str(p, 'reference')} · General / factory use`,
        detail: `${str(p, 'kind') === 'request' ? 'Requested' : 'Issued'}${str(p, 'costCenter') ? ` for ${str(p, 'costCenter')}` : ''} · ${str(p, 'reason') || 'no reason given'} · not linked to any order`,
        href: str(p, 'requestId') ? `/mis/store/requests/${str(p, 'requestId')}` : '/mis/store/transactions',
        tone: 'info',
      };
    case NOTIFICATION_TYPES.regularizationRaised:
      return {
        title: `${str(p, 'employeeName') || 'A worker'}${str(p, 'employeeCode') ? ` (${str(p, 'employeeCode')})` : ''} · missed punch`,
        detail: `Asked to fix the punch for ${str(p, 'workDate')} · waiting for review`,
        href: '/mis/attendance/regularization',
        tone: 'info',
      };
    case NOTIFICATION_TYPES.regularizationDecided: {
      const approved = str(p, 'decision') === 'APPROVED';
      return {
        title: `Missed punch for ${str(p, 'workDate')} · ${approved ? 'approved' : 'rejected'}`,
        detail: str(p, 'note') || (approved ? 'Your attendance was corrected' : 'Your request was rejected'),
        href: '/mis/me/regularization',
        tone: approved ? 'ok' : 'risk',
      };
    }
    case NOTIFICATION_TYPES.longOvertime: {
      const mins = num(p, 'otMinutes');
      return {
        title: `${str(p, 'employeeName') || 'A worker'}${str(p, 'employeeCode') ? ` (${str(p, 'employeeCode')})` : ''} · overtime`,
        detail: `${Math.floor(mins / 60)}h ${mins % 60}m overtime on ${str(p, 'workDate')} · counted in payroll`,
        href: `/mis/attendance?date=${str(p, 'workDate')}`,
        tone: 'risk',
      };
    }
    case NOTIFICATION_TYPES.bomRejected:
      return {
        title: `BOM sent back · ${str(p, 'orderNumber')}`,
        detail: str(p, 'reason') || 'Rejected — back to draft',
        href: `/mis/bom/${str(p, 'orderId')}`,
        tone: 'risk',
      };
    default:
      return null;
  }
}

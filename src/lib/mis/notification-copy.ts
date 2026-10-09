/**
 * V2 — what a MIS notification row says on the bell, by type. Owner/Admin/Store Guy only
 * (`server/mis/notifications.ts` decides who is served); this just turns a payload into words.
 *
 * Pure: no Prisma, no React.
 */

export const MIS_NOTIFY_ROLES = ['OWNER', 'ADMIN', 'STORE_GUY'] as const;
export type MisNotifyRole = (typeof MIS_NOTIFY_ROLES)[number];

export function isMisNotifyRole(role: string | null | undefined): role is MisNotifyRole {
  return (MIS_NOTIFY_ROLES as readonly string[]).includes(role ?? '');
}

export const NOTIFICATION_TYPES = {
  grnConfirmed: 'mis.grn_confirmed',
  requestRaised: 'mis.material_request.raised',
  requestDecided: 'mis.material_request.decided',
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
      const approved = p.status === 'APPROVED';
      return {
        title: `${str(p, 'requestNumber')} ${approved ? 'approved and issued' : 'rejected'}`,
        detail: approved ? `${num(p, 'lineCount')} ${num(p, 'lineCount') === 1 ? 'line' : 'lines'} issued` : str(p, 'reason') || 'No reason given',
        href: `/mis/store/requests/${str(p, 'requestId')}`,
        tone: approved ? 'ok' : 'risk',
      };
    }
    default:
      return null;
  }
}

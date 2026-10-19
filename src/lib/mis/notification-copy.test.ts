import { describe, expect, it } from 'vitest';

import { MIS_NOTIFY_ROLES, NOTIFICATION_TYPES, isMisNotifyRole, notificationView } from './notification-copy';

describe('who gets the bell', () => {
  it('is exactly Owner, Admin, Store Guy and (R2-67) Supervisor', () => {
    expect([...MIS_NOTIFY_ROLES]).toEqual(['OWNER', 'ADMIN', 'STORE_GUY', 'SUPERVISOR']);
    for (const r of ['QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'WORKER', null]) expect(isMisNotifyRole(r)).toBe(false);
  });
});

describe('notificationView — R2-67 / R2-80', () => {
  it('a decided request tells the Supervisor what happened and links to it', () => {
    expect(notificationView(NOTIFICATION_TYPES.requestDecided, { requestId: 'r', requestNumber: 'MRN-1', decision: 'APPROVED', pickList: true })).toMatchObject({ title: 'MRN-1 · approved by the Store', tone: 'ok', href: '/mis/store/requests/r' });
    expect(notificationView(NOTIFICATION_TYPES.requestDecided, { requestId: 'r', requestNumber: 'MRN-1', decision: 'REJECTED', note: 'Out of stock' })).toMatchObject({ title: 'MRN-1 · rejected by the Store', detail: 'Out of stock', tone: 'risk' });
  });
  it('a general-use alert says it is not linked to any order', () => {
    const v = notificationView(NOTIFICATION_TYPES.generalUse, { reference: 'MRN-2', kind: 'request', costCenter: 'Press', reason: 'grease', requestId: 'r2' })!;
    expect(v.detail).toBe('Requested for Press · grease · not linked to any order');
    expect(v.href).toBe('/mis/store/requests/r2');
  });
});

describe('notificationView', () => {
  it('a GRN alert reads as a sentence and links to the GRN; attention sets the tone', () => {
    const v = notificationView(NOTIFICATION_TYPES.grnConfirmed, { grnId: 'g', grnNumber: 'GRN-1', poNumber: 'PO-1', supplierName: 'Acme', attention: true, lines: [{}, {}], totals: { ordered: 100, received: 90, short: 6, damaged: 4 } })!;
    expect(v).toEqual({ title: 'GRN-1 received · PO-1 · Acme', detail: '2 lines · 90 of 100 received · 6 short · 4 damaged', href: '/mis/grn/g', tone: 'risk' });
  });
  it('a raised request', () => {
    expect(notificationView(NOTIFICATION_TYPES.requestRaised, { requestId: 'r', requestNumber: 'MRN-1', lineCount: 1, orderNumber: 'ORD-1' })).toMatchObject({ title: 'MRN-1 · material requested', detail: '1 line · for ORD-1 · waiting for the Store', href: '/mis/store/requests/r' });
  });
  it('an unknown type or a junk payload is null / safe, never "undefined" on screen', () => {
    expect(notificationView('security.access_denied', {})).toBeNull();
    expect(notificationView(NOTIFICATION_TYPES.grnConfirmed, 'junk')!.title).toBe(' received · ');
  });
});

import { describe, expect, it } from 'vitest';

import { MIS_ACTIONS, allowedActions, can } from './permissions';
import { MIS_ROLES } from './roles';

describe('permission matrix', () => {
  it('covers every role', () => {
    for (const role of MIS_ROLES) {
      expect(Array.isArray(allowedActions(role))).toBe(true);
    }
  });

  it('gives the owner everything', () => {
    for (const action of MIS_ACTIONS) {
      expect(can('OWNER', action), action).toBe(true);
    }
  });

  it('keeps wages owner-only — money never widens', () => {
    for (const role of MIS_ROLES) {
      expect(can(role, 'wages.read'), role).toBe(role === 'OWNER');
    }
  });

  it('does not let an admin read wages even though it can do everything else', () => {
    expect(can('ADMIN', 'settings.write')).toBe(true);
    expect(can('ADMIN', 'wages.read')).toBe(false);
  });

  it('keeps a QC user out of production writes', () => {
    expect(can('QC', 'qc.write')).toBe(true);
    expect(can('QC', 'production.write')).toBe(false);
  });

  it('keeps an attendance operator out of orders entirely', () => {
    expect(can('ATTENDANCE_OPERATOR', 'orders.read')).toBe(false);
    expect(can('ATTENDANCE_OPERATOR', 'attendance.write')).toBe(true);
  });

  it('gives a worker nothing — a worker has no login', () => {
    expect(allowedActions('WORKER')).toEqual([]);
  });

  it('gives a user with no MIS record nothing', () => {
    expect(can(null, 'masters.read')).toBe(false);
    expect(allowedActions(undefined)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import { MIS_ROLES, assignableRoles, isMisRole, roleLabelKey, roleTone } from './roles';
import { DICTIONARIES } from './i18n/dictionaries';

describe('role vocabulary', () => {
  it('has exactly the seven roles from the spec', () => {
    expect(MIS_ROLES).toHaveLength(7);
    expect(MIS_ROLES).toContain('SUPER_ATTENDANCE_OPERATOR');
  });

  it('recognises its own roles and rejects anything else', () => {
    expect(isMisRole('OWNER')).toBe(true);
    expect(isMisRole('member')).toBe(false);
    expect(isMisRole(null)).toBe(false);
  });

  it('has a translated label for every role in both locales', () => {
    for (const role of MIS_ROLES) {
      const key = roleLabelKey(role);
      expect(DICTIONARIES.en[key]).toBeTruthy();
      expect(DICTIONARIES.hi[key]).toBeTruthy();
    }
  });

  it('gives every role a badge tone', () => {
    for (const role of MIS_ROLES) {
      expect(roleTone(role)).toBeTruthy();
    }
  });
});

describe('assignableRoles', () => {
  it('lets an owner assign anything', () => {
    expect(assignableRoles('OWNER')).toHaveLength(7);
  });

  it('never lets an admin create an owner', () => {
    const list = assignableRoles('ADMIN');
    expect(list).not.toContain('OWNER');
    expect(list).toHaveLength(6);
  });

  it('gives everyone else nothing to assign', () => {
    expect(assignableRoles('SUPERVISOR')).toEqual([]);
    expect(assignableRoles('QC')).toEqual([]);
    expect(assignableRoles('WORKER')).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
  });
});

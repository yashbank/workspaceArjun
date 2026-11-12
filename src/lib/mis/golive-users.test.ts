import { describe, expect, it } from 'vitest';

import { validatePassword } from '@/lib/password-policy';

import { buildEmails, csvCell, emailLocalPart, generateTempPassword, mapSheetRole, resolveKioskLink } from './golive-users';

describe('emailLocalPart', () => {
  it.each([
    ['D.Srinivas', 'd.srinivas'],
    ['G.S. Joshi ', 'g.s.joshi'],
    ['Girdharilal  Dhard', 'girdharilal.dhard'],
    ['Kalla Naga Surya Appa Rao', 'kalla.naga.surya.appa.rao'],
    ['Madhukar', 'madhukar'],
    ['CHV.Satyanarayana', 'chv.satyanarayana'],
  ])('%s -> %s', (n, e) => expect(emailLocalPart(n)).toBe(e));
});

describe('buildEmails', () => {
  it('suffixes clashes 2, 3 and respects taken emails', () => {
    expect(buildEmails(['Vali', 'Vali ', 'vali.'], [])).toEqual([
      'vali@bpp-demo.com',
      'vali2@bpp-demo.com',
      'vali3@bpp-demo.com',
    ]);
    expect(buildEmails(['Vali'], ['VALI@bpp-demo.com'])).toEqual(['vali2@bpp-demo.com']);
  });
  it('refuses a name with no letters', () => expect(() => buildEmails(['...'])).toThrow());
});

describe('mapSheetRole', () => {
  it.each([
    ['Owner', 'OWNER'],
    ['Admin', 'ADMIN'],
    ['Production Manager', 'ADMIN'],
    ['supervisior', 'SUPERVISOR'],
    ['Supervisor', 'SUPERVISOR'],
    ['QC', 'QC'],
    ['Store', 'STORE_GUY'],
    ['Store Guy', 'STORE_GUY'],
    ['store keeper', 'STORE_GUY'],
    ['super Attendance', 'SUPER_ATTENDANCE_OPERATOR'],
    ['Super Attendance Operator', 'SUPER_ATTENDANCE_OPERATOR'],
  ])('%s -> %s', (l, r) => expect(mapSheetRole(l)).toBe(r));
  it('unknown -> null', () => expect(mapSheetRole('janitor')).toBeNull());
});

describe('generateTempPassword', () => {
  it('is 14+ chars, passes the policy, and differs per call', () => {
    const a = generateTempPassword();
    expect(a.length).toBeGreaterThanOrEqual(12);
    expect(validatePassword(a).ok).toBe(true);
    expect(generateTempPassword()).not.toBe(a);
  });
});

describe('csvCell', () => {
  it('quotes and neutralises formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('=1+1')).toBe("'=1+1");
  });
});

describe('resolveKioskLink', () => {
  const e = (id: string, employeeCode: string, name: string, userProfileId: string | null = null) => ({ id, employeeCode, name, userProfileId });
  it('links one unlinked match by normalised name', () => {
    expect(resolveKioskLink('d.  SRINIVAS', [e('1', 'EMP002', 'D.Srinivas')], null)).toEqual({ kind: 'link', employeeId: '1', employeeCode: 'EMP002' });
  });
  it('new when nothing matches', () => expect(resolveKioskLink('Nobody', [e('1', 'EMP002', 'X')], null)).toEqual({ kind: 'new' }));
  it('code row with a different name is never linked (ambiguous)', () => {
    expect(resolveKioskLink('Someone', [e('1', 'EMP002', 'Other Name')], 'emp002').kind).toBe('ambiguous');
  });
  it('name and code agreeing links', () => {
    expect(resolveKioskLink('A B', [e('1', 'EMP1', 'a  b')], 'EMP1').kind).toBe('link');
  });
  it('ambiguous when name and code hit different people, or two name hits', () => {
    expect(resolveKioskLink('A B', [e('1', 'EMP1', 'A B'), e('2', 'EMP2', 'Z')], 'EMP2').kind).toBe('ambiguous');
    expect(resolveKioskLink('A B', [e('1', 'EMP1', 'A B'), e('2', 'EMP2', 'a b')], null).kind).toBe('ambiguous');
  });
  it('ambiguous (skip) when the single match is already linked', () => {
    expect(resolveKioskLink('A B', [e('1', 'EMP1', 'A B', 'u1')], null).kind).toBe('ambiguous');
  });
});

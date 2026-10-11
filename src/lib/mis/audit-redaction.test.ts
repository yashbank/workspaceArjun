import { describe, expect, it } from 'vitest';

import { MIS_ROLES } from './roles';
import { can } from './permissions';
import { auditChangesForRole, diffPayloads, redactAuditForRole, redactForStorage, REDACTED } from './audit-redaction';

describe('redactForStorage (write time)', () => {
  it('masks wage keys at any depth, in objects and arrays', () => {
    const out = redactForStorage({ a: { b: [{ grossPay: 731.19, name: 'x' }] }, hra: 5, allowance: 6 });
    expect(JSON.stringify(out)).not.toMatch(/731\.19|:5|:6/);
    expect(out).toMatchObject({ a: { b: [{ grossPay: REDACTED, name: 'x' }] }, hra: REDACTED, allowance: REDACTED });
  });

  it('keeps the material price and supplier invoice amount so the Owner can see the change', () => {
    expect(redactForStorage({ pricePerUnit: 12.5, supplierInvoiceAmount: 900 })).toEqual({ pricePerUnit: 12.5, supplierInvoiceAmount: 900 });
  });

  it('does not treat a count discrepancy (a quantity) as money', () => {
    expect(redactForStorage({ discrepancy: 3 })).toEqual({ discrepancy: 3 });
  });
});

describe('redactAuditForRole (read time)', () => {
  const stored = {
    pricePerUnit: 12.5,
    lines: [{ ratePerUnit: 3, qty: 2, deep: { supplierInvoiceAmount: 77, invoiceAmount: 1 } }],
    note: 'kept',
  };

  for (const role of MIS_ROLES) {
    it(`${role}: ${can(role, 'wages.read') ? 'sees the stored money' : 'gets no money key at any depth'}`, () => {
      const out = JSON.stringify(redactAuditForRole(role, stored));
      if (can(role, 'wages.read')) {
        expect(out).toContain('12.5');
      } else {
        expect(out).not.toMatch(/pricePerUnit|ratePerUnit|supplierInvoiceAmount|invoiceAmount|12\.5/);
        expect(out).toContain('kept');
        expect(out).toContain('"qty":2');
      }
    });
  }

  it('does not mutate its input and null role is treated as non-owner', () => {
    redactAuditForRole(null, stored);
    expect(stored.pricePerUnit).toBe(12.5);
    expect(redactAuditForRole(null, stored)).not.toHaveProperty('pricePerUnit');
  });

  it('rows already stored as "[redacted]" stay that way', () => {
    expect(redactAuditForRole('OWNER', { x: REDACTED })).toEqual({ x: REDACTED });
  });
});

describe('diffPayloads', () => {
  it('lists changed leaves only, old -> new, with nested paths', () => {
    expect(diffPayloads({ a: 1, b: { c: 2, d: 3 } }, { a: 1, b: { c: 9, d: 3 }, e: 'new' })).toEqual([
      { path: 'b.c', from: 2, to: 9 },
      { path: 'e', from: undefined, to: 'new' },
    ]);
  });
  it('handles a missing side (create / delete)', () => {
    expect(diffPayloads(null, { a: 1 })).toEqual([{ path: 'a', from: undefined, to: 1 }]);
    expect(diffPayloads({ a: 1 }, null)).toEqual([{ path: 'a', from: 1, to: undefined }]);
  });
});

describe('auditChangesForRole (what the audit screen receives)', () => {
  const before = { pricePerUnit: 10, name: 'Kraft' };
  const after = { pricePerUnit: 12, name: 'Kraft', lines: [{ ratePerUnit: 4 }], severity: 'WARNING' };

  it('Owner sees old -> new price and the severity is lifted out of the diff', () => {
    const r = auditChangesForRole('OWNER', before, after);
    expect(r.severity).toBe('WARNING');
    expect(r.changes).toContainEqual({ path: 'pricePerUnit', from: '10', to: '12' });
    expect(r.changes.some((c) => c.path === 'severity')).toBe(false);
  });

  it('Admin gets no money anywhere in the payload handed to the client', () => {
    const r = auditChangesForRole('ADMIN', before, after);
    expect(JSON.stringify(r)).not.toMatch(/pricePerUnit|ratePerUnit|"(10|12|4)"/);
    expect(r.changes.some((c) => /price|rate/i.test(c.path))).toBe(false);
  });
});

describe('ruleValue fails closed', () => {
  it('is dropped for every role unless the same payload names a non-wage ruleKey', () => {
    expect(redactAuditForRole('OWNER', { ruleValue: '1' })).toEqual({});
    expect(redactAuditForRole('OWNER', { ruleKey: 'DAILY_WAGE_DEFAULT', ruleValue: '1' })).toEqual({ ruleKey: 'DAILY_WAGE_DEFAULT' });
    expect(redactAuditForRole('ADMIN', { ruleKey: 'line_clearance.mode', ruleValue: 'SHIFT' })).toEqual({ ruleKey: 'line_clearance.mode', ruleValue: 'SHIFT' });
  });
});

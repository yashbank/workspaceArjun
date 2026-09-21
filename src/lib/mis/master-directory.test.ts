import { describe, expect, it } from 'vitest';

import { MASTER_GROUPS } from './master-groups';
import {
  MASTERS,
  NAV_GROUPS,
  countsFrom,
  hindiOrNull,
  masterSpec,
  matchesQuery,
  missingRequired,
  optionGroupOf,
  optionMasterKey,
  writableValues,
} from './master-directory';

describe('the directory is one table', () => {
  it('has a unique key and a route for every master, and covers every option group', () => {
    const keys = MASTERS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of MASTERS) expect(m.href).toMatch(/^\/mis\//);
    for (const g of MASTER_GROUPS) expect(masterSpec(`option-${g.toLowerCase()}`)).not.toBeNull();
    expect(MASTERS.length).toBe(6 + MASTER_GROUPS.length);
  });

  it('every master sits in a known sub-nav group', () => {
    for (const m of MASTERS) expect(NAV_GROUPS).toContain(m.nav);
  });

  it('every master has a code or a label as its required first field', () => {
    for (const m of MASTERS) expect(m.fields.some((f) => f.required)).toBe(true);
  });

  it('an unknown master is null, not a crash', () => {
    expect(masterSpec('nope')).toBeNull();
    expect(optionMasterKey('NOPE')).toBeNull();
    expect(optionMasterKey('GSM')).toBe('option-gsm');
    expect(optionGroupOf('option-item_type')).toBe('ITEM_TYPE');
    expect(optionGroupOf('machines')).toBeNull();
  });
});

describe('no money, no invented Hindi', () => {
  it('no master has a price, rate or wage field or column', () => {
    for (const m of MASTERS) {
      for (const key of [...m.fields.map((f) => f.key), ...m.columns]) expect(key).not.toMatch(/price|^rate|Rate|wage|cost|salary|amount/); // 'substrate' is not a rate
    }
  });

  it('a Hindi field exists exactly for the masters that have a Hindi name — machines and raw materials have none', () => {
    for (const m of MASTERS) {
      const has = m.fields.some((f) => f.key === 'nameHi' || f.key === 'labelHi');
      expect(has).toBe(m.hasHindi);
    }
    expect(masterSpec('machines')!.hasHindi).toBe(false);
    expect(masterSpec('items')!.hasHindi).toBe(false);
    expect(masterSpec('departments')!.hasHindi).toBe(true);
  });
});

describe('code is read-only after creation', () => {
  const machines = masterSpec('machines')!;
  const values = { code: 'MC-NEW', name: 'Renamed', departmentId: 'd1', machineType: '', capacityPerDay: '' };

  it('an update never writes the code; a create does', () => {
    expect(writableValues(machines, values, true)).not.toHaveProperty('code');
    expect(writableValues(machines, values, true)).toMatchObject({ name: 'Renamed', departmentId: 'd1' });
    expect(writableValues(machines, values, false)).toHaveProperty('code', 'MC-NEW');
  });

  it('a field that is not on the form is never written, even if posted', () => {
    expect(writableValues(machines, { ...values, isActive: 'false', deletedAt: 'x', pricePerUnit: '9' }, true)).not.toHaveProperty('isActive');
    expect(writableValues(machines, { ...values, pricePerUnit: '9' }, false)).not.toHaveProperty('pricePerUnit');
  });

  it('an update does not demand a code — it is not on an existing row\'s form — but a create does', () => {
    expect(missingRequired(machines, { name: 'X' }, true)).toBeNull();
    expect(missingRequired(machines, { name: 'X' }, false)).toBe('code');
    expect(missingRequired(machines, { code: 'C', name: '  ' }, false)).toBe('name');
  });

  it('a defect type requires its severity', () => {
    expect(missingRequired(masterSpec('defect-types')!, { code: 'C', name: 'N', severity: '' }, false)).toBe('severity');
  });
});

describe('counts, Hindi and search', () => {
  it('counts add up and cannot go negative', () => {
    expect(countsFrom(21, 2)).toEqual({ total: 21, active: 19, deactivated: 2 });
    expect(countsFrom(3, 9)).toEqual({ total: 3, active: 0, deactivated: 3 });
    expect(countsFrom(0, 0)).toEqual({ total: 0, active: 0, deactivated: 0 });
  });

  it('a missing Hindi name is null however it is empty', () => {
    for (const v of [null, undefined, '', '   ', 5]) expect(hindiOrNull(v)).toBeNull();
    expect(hindiOrNull(' हिन्दी ')).toBe('हिन्दी');
  });

  it('search matches the code and both names, ignoring case, and an empty query matches all', () => {
    const row = { code: 'MC-HD74', name: 'Heidelberg SM 74', nameHi: 'हाइडलबर्ग' };
    expect(matchesQuery(row, 'hd74')).toBe(true);
    expect(matchesQuery(row, 'HEIDEL')).toBe(true);
    expect(matchesQuery(row, 'हाइड')).toBe(true);
    expect(matchesQuery(row, 'polar')).toBe(false);
    expect(matchesQuery(row, '  ')).toBe(true);
    expect(matchesQuery({ code: null, name: 'Units', nameHi: null }, 'unit')).toBe(true);
  });
});

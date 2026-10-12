import { describe, expect, it } from 'vitest';

import { machineMismatchNote, operatorOptions, preselectMachine, stageOptions, unitOptions } from './production-form';

const emp = (id: string, role: string, extra: Record<string, unknown> = {}) => ({
  id, name: `N-${id}`, employeeCode: `E-${id}`, role, isActive: true, ...extra,
});

describe('operatorOptions (#19)', () => {
  it('lists only WORKER and SUPERVISOR, labelled Name (CODE · Role)', () => {
    const roles = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'STORE_GUY', 'WORKER'];
    const out = operatorOptions(roles.map((r, i) => emp(String(i), r)));
    expect(out.map((o) => o.label)).toEqual(['N-2 (E-2 · Supervisor)', 'N-7 (E-7 · Worker)']);
  });
  it('drops inactive people', () => {
    expect(operatorOptions([emp('1', 'WORKER', { isActive: false })])).toEqual([]);
  });
});

describe('unitOptions (#16)', () => {
  it('uses the master labels and always offers KG', () => {
    expect(unitOptions([{ label: 'LITRE' }]).map((o) => o.value)).toEqual(['LITRE', 'KG']);
  });
  it('falls back to the built-in units when the master is empty', () => {
    expect(unitOptions([]).map((o) => o.value)).toContain('KG');
  });
  it('keeps an existing free-text value so it still displays', () => {
    expect(unitOptions([{ label: 'KG' }], 'Rolls').map((o) => o.value)).toEqual(['KG', 'Rolls']);
  });
  it('does not duplicate KG case-insensitively', () => {
    expect(unitOptions([{ label: 'kg' }]).map((o) => o.value)).toEqual(['kg']);
  });
});

describe('stageOptions (#18/#33)', () => {
  it('orders by seq', () => {
    expect(stageOptions([{ id: 'b', stageName: 'Coat', seq: 2 }, { id: 'a', stageName: 'Print', seq: 1 }]).map((o) => o.value)).toEqual(['a', 'b']);
  });
});

describe('machine pre-fill (#39/#43)', () => {
  it('pre-selects when exactly one machine is allocated', () => {
    expect(preselectMachine(['m1'])).toBe('m1');
    expect(preselectMachine(['m1', 'm1'])).toBe('m1');
  });
  it('does not guess with none or several', () => {
    expect(preselectMachine([])).toBeNull();
    expect(preselectMachine(['m1', 'm2'])).toBeNull();
  });
  it('notes a different choice, never blocks', () => {
    const alloc = [{ id: 'm1', name: 'Coater 1' }];
    expect(machineMismatchNote('m2', alloc)).toBe('Allocated machine is Coater 1');
    expect(machineMismatchNote('m1', alloc)).toBeNull();
    expect(machineMismatchNote('m2', [])).toBeNull();
    expect(machineMismatchNote(null, alloc)).toBeNull();
  });
});

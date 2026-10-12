import { describe, expect, it } from 'vitest';

import { managerOptionLabel } from './employee-labels';

describe('managerOptionLabel', () => {
  it('shows name, code and role', () => {
    const label = managerOptionLabel({ name: 'Ravi Kumar', employeeCode: 'E-014', role: 'SUPERVISOR' }, (r) => r.toLowerCase());
    expect(label).toBe('Ravi Kumar (E-014 · supervisor)');
  });
  it('tells two people with the same name apart', () => {
    const role = (r: string) => r;
    const a = managerOptionLabel({ name: 'Amit', employeeCode: 'E-1', role: 'WORKER' }, role);
    const b = managerOptionLabel({ name: 'Amit', employeeCode: 'E-2', role: 'QC' }, role);
    expect(a).not.toBe(b);
  });
});

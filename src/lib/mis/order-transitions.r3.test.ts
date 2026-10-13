import { describe, expect, it } from 'vitest';
import { evaluateCloseGates, unmetGates } from './order-transitions';

const base = { phases: [], qcChecks: [] };

describe('R3 B105 — production-logged close gate', () => {
  it('zero logs adds an unmet PRODUCTION_LOGGED gate', () => {
    const unmet = unmetGates(evaluateCloseGates({ ...base, productionCount: 0 }));
    expect(unmet.map((g) => g.key)).toEqual(['PRODUCTION_LOGGED']);
    expect(unmet[0].detail).toBe('No production has been logged');
  });
  it('one log meets it', () => {
    const gates = evaluateCloseGates({ ...base, productionCount: 1 });
    expect(unmetGates(gates)).toEqual([]);
    expect(gates.find((g) => g.key === 'PRODUCTION_LOGGED')?.passed).toBe(true);
  });
  it('the old call without the field gives the old two gates', () => {
    expect(evaluateCloseGates(base).map((g) => g.key)).toEqual(['PHASES_SIGNED_OFF', 'QC_RESOLVED']);
  });
});

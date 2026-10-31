import { describe, expect, it } from 'vitest';
import {
  canOverrideCloseGates, canTransitionOrder, evaluateCloseGates, isOrderStatus, ORDER_STATUSES, ORDER_TRANSITIONS, unmetGates,
} from './order-transitions';

describe('order transition table', () => {
  const legal: [string, string][] = [
    ['DRAFT', 'CONFIRMED'], ['DRAFT', 'CANCELLED'], ['CONFIRMED', 'IN_PRODUCTION'], ['CONFIRMED', 'CANCELLED'],
    ['IN_PRODUCTION', 'COMPLETED'], ['IN_PRODUCTION', 'CANCELLED'], ['COMPLETED', 'DELIVERED'], ['COMPLETED', 'IN_PRODUCTION'],
  ];
  it.each(legal)('allows %s -> %s', (a, b) => expect(canTransitionOrder(a, b)).toBe(true));

  it('allows nothing else: every other pair is refused', () => {
    for (const a of ORDER_STATUSES) for (const b of ORDER_STATUSES) {
      const expected = legal.some(([x, y]) => x === a && y === b);
      expect(canTransitionOrder(a, b)).toBe(expected);
    }
  });

  it('DELIVERED and CANCELLED are terminal', () => {
    expect(ORDER_TRANSITIONS.DELIVERED).toEqual([]);
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('rejects unknown values, including the tester\'s "COMPLETE"', () => {
    expect(isOrderStatus('COMPLETE')).toBe(false);
    expect(canTransitionOrder('IN_PRODUCTION', 'COMPLETE')).toBe(false);
    expect(canTransitionOrder('NOPE', 'DRAFT')).toBe(false);
  });
});

describe('R2-264 evaluateCloseGates — ordered quantity', () => {
  const base = { phases: [], qcChecks: [] };
  it('no `ordered` (an order without a quantity) adds no gate', () => {
    expect(evaluateCloseGates(base).map((g) => g.key)).toEqual(['PHASES_SIGNED_OFF', 'QC_RESOLVED']);
    expect(evaluateCloseGates({ ...base, ordered: null }).map((g) => g.key)).toEqual(['PHASES_SIGNED_OFF', 'QC_RESOLVED']);
  });
  it('fails while produced < ordered, naming both figures; passes at or above', () => {
    const short = evaluateCloseGates({ ...base, ordered: { quantity: 10000, unit: 'PIECE', produced: 9500 } }).find((g) => g.key === 'QUANTITY_MET')!;
    expect(short).toMatchObject({ passed: false, detail: 'Produced 9500 of 10000 PIECE' });
    expect(evaluateCloseGates({ ...base, ordered: { quantity: 10000, unit: 'PIECE', produced: 10000 } }).find((g) => g.key === 'QUANTITY_MET')!.passed).toBe(true);
  });
});

describe('evaluateCloseGates', () => {
  const t = (h: number) => new Date(2026, 9, 1, h);
  it('an order with no phase plan and no QC passes everything', () => {
    expect(unmetGates(evaluateCloseGates({ phases: [], qcChecks: [] }))).toEqual([]);
  });
  it('unsigned phases fail the phase gate; NOT_APPLICABLE ones are ignored', () => {
    const gates = evaluateCloseGates({ phases: [{ status: 'SIGNED_OFF' }, { status: 'NOT_APPLICABLE' }, { status: 'IN_PROGRESS' }, { status: 'REOPENED' }], qcChecks: [] });
    const unmet = unmetGates(gates);
    expect(unmet.map((g) => g.key)).toEqual(['PHASES_SIGNED_OFF']);
    expect(unmet[0].detail).toBe('2 of 3 phases not signed off');
  });
  it('a FAIL with no later PASS on the same stage + parameter fails the QC gate', () => {
    const gates = evaluateCloseGates({ phases: [], qcChecks: [{ bomStageId: 's1', parameterName: 'Shade', result: 'FAIL', checkTime: t(9) }] });
    expect(unmetGates(gates).map((g) => g.key)).toEqual(['QC_RESOLVED']);
  });
  it('a later PASS on the same parameter resolves it; a PASS on another does not', () => {
    const fail = { bomStageId: 's1', parameterName: 'Shade', result: 'FAIL', checkTime: t(9) };
    expect(unmetGates(evaluateCloseGates({ phases: [], qcChecks: [fail, { ...fail, result: 'PASS', checkTime: t(10) }] }))).toEqual([]);
    expect(unmetGates(evaluateCloseGates({ phases: [], qcChecks: [fail, { ...fail, parameterName: 'Gsm', result: 'PASS', checkTime: t(10) }] }))).toHaveLength(1);
  });
  it('a PASS followed by a later FAIL is unresolved', () => {
    const pass = { bomStageId: null, parameterName: null, result: 'PASS', checkTime: t(9) };
    expect(unmetGates(evaluateCloseGates({ phases: [], qcChecks: [pass, { ...pass, result: 'FAIL', checkTime: t(11) }] }))).toHaveLength(1);
  });
});

describe('canOverrideCloseGates', () => {
  it.each([['OWNER', true], ['ADMIN', true], ['SUPERVISOR', false], ['QC', false], ['STORE_GUY', false]])('%s -> %s', (r, ok) => {
    expect(canOverrideCloseGates(r)).toBe(ok);
  });
});

describe('R2-319 QC parameter names are matched case- and space-insensitively', () => {
  it("a later PASS on 'shade ' resolves the FAIL on 'Shade'", () => {
    const gates = evaluateCloseGates({
      phases: [],
      qcChecks: [
        { bomStageId: null, parameterName: 'Shade', result: 'FAIL', checkTime: '2026-10-01T09:00:00Z' },
        { bomStageId: null, parameterName: 'shade ', result: 'PASS', checkTime: '2026-10-01T10:00:00Z' },
      ],
    });
    expect(gates.find((g) => g.key === 'QC_RESOLVED')?.passed).toBe(true);
  });
  it('a different stage with the same parameter name stays distinct', () => {
    const gates = evaluateCloseGates({
      phases: [],
      qcChecks: [
        { bomStageId: 's1', parameterName: 'Shade', result: 'FAIL', checkTime: '2026-10-01T09:00:00Z' },
        { bomStageId: 's2', parameterName: 'shade', result: 'PASS', checkTime: '2026-10-01T10:00:00Z' },
      ],
    });
    expect(gates.find((g) => g.key === 'QC_RESOLVED')?.passed).toBe(false);
  });
});

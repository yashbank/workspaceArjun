import { describe, expect, it } from 'vitest';

import {
  GENERAL_COST_CENTER_REQUIRED,
  GENERAL_REASON_REQUIRED,
  GENERAL_USE_REQUIRED,
  generalUseLabel,
  resolveGeneralUse,
  storedGeneralInput,
} from './general-use';

describe('resolveGeneralUse', () => {
  it('an order is the attribution — general fields are ignored and nothing is tagged GENERAL', () => {
    expect(resolveGeneralUse('o1', { reason: 'grease', costCenter: 'Press' })).toEqual({ isGeneral: false, generalReason: null, costCenter: null });
    expect(resolveGeneralUse('o1', null)).toEqual({ isGeneral: false, generalReason: null, costCenter: null });
  });
  it('no order and no general block is refused in words', () => {
    expect(() => resolveGeneralUse(null, null)).toThrow(GENERAL_USE_REQUIRED);
    expect(() => resolveGeneralUse(undefined, undefined)).toThrow(GENERAL_USE_REQUIRED);
  });
  it('no order needs a reason of 3+ characters and a cost centre', () => {
    expect(() => resolveGeneralUse(null, { reason: '  ', costCenter: 'Press' })).toThrow(GENERAL_REASON_REQUIRED);
    expect(() => resolveGeneralUse(null, { reason: 'ab', costCenter: 'Press' })).toThrow(GENERAL_REASON_REQUIRED);
    expect(() => resolveGeneralUse(null, { reason: 'grease', costCenter: ' ' })).toThrow(GENERAL_COST_CENTER_REQUIRED);
    expect(() => resolveGeneralUse(null, { reason: 'grease' })).toThrow(GENERAL_COST_CENTER_REQUIRED);
  });
  it('a complete block is trimmed and tagged GENERAL', () => {
    expect(resolveGeneralUse(null, { reason: '  grease for plates ', costCenter: ' Press ' })).toEqual({ isGeneral: true, generalReason: 'grease for plates', costCenter: 'Press' });
  });
});

describe('generalUseLabel', () => {
  it('is null for an order-linked row', () => {
    expect(generalUseLabel({ isGeneral: false })).toBeNull();
    expect(generalUseLabel({})).toBeNull();
  });
  it('reads as "not linked to any order"', () => {
    expect(generalUseLabel({ isGeneral: true, costCenter: 'Press', generalReason: 'grease' })).toBe('General / factory use · Press · grease (not linked to any order)');
  });
});

describe('storedGeneralInput', () => {
  it('returns the stored block for a tagged row, nothing for an order row, and a legacy block for an untagged no-order row', () => {
    expect(storedGeneralInput({ isGeneral: true, generalReason: 'grease', costCenter: 'Press' })).toEqual({ reason: 'grease', costCenter: 'Press' });
    expect(storedGeneralInput({ orderId: 'o1', isGeneral: false })).toBeNull();
    const legacy = storedGeneralInput({ orderId: null, isGeneral: false });
    expect(() => resolveGeneralUse(null, legacy)).not.toThrow();
  });
});

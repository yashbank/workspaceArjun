import { describe, expect, it } from 'vitest';
import { labelChoices, unitChoices } from './item-options';

describe('R3-MST B32 unitChoices', () => {
  it('offers only options the enum can store', () => {
    const out = unitChoices([{ value: 'KG', label: 'Kilogram' }, { value: 'SHEETS', label: 'Sheets' }]);
    expect(out).toEqual([{ value: 'KG', label: 'Kilogram' }]);
  });
  it('falls back to the 4 legacy values when the master is empty', () => {
    expect(unitChoices([]).map((o) => o.value)).toEqual(['KG', 'LITRE', 'PIECE', 'REAM']);
  });
});

describe('R3-MST B32 labelChoices', () => {
  it('adds a "(not in masters)" entry for a legacy value', () => {
    const out = labelChoices([{ value: '80', label: '80 GSM' }], '75 GSM');
    expect(out.map((o) => o.label)).toEqual(['80 GSM', '75 GSM (not in masters)']);
    expect(out[1].value).toBe('75 GSM');
  });
  it('adds nothing when the value is listed or empty', () => {
    expect(labelChoices([{ value: '80', label: '80 GSM' }], '80 GSM')).toHaveLength(1);
    expect(labelChoices([{ value: '80', label: '80 GSM' }], '')).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { filterComboOptions } from './combobox-filter';

const opts = [
  { value: '1', label: 'Kraft Paper 80 GSM', hint: 'ITM-0001' },
  { value: '2', label: 'FBB Board 300 GSM', hint: 'ITM-0002' },
  { value: '3', label: 'Ink Cyan' },
];

describe('R2-82 filterComboOptions', () => {
  it('empty query returns everything', () => expect(filterComboOptions(opts, '  ')).toHaveLength(3));
  it('matches case-insensitively on label and hint, every word must match', () => {
    expect(filterComboOptions(opts, 'kraft').map((o) => o.value)).toEqual(['1']);
    expect(filterComboOptions(opts, 'gsm 0002').map((o) => o.value)).toEqual(['2']);
    expect(filterComboOptions(opts, 'gsm ink')).toEqual([]);
  });
  it('caps the result', () => expect(filterComboOptions(opts, '', 2)).toHaveLength(2));
});

import { describe, expect, it } from 'vitest';

import { filterByMachineName } from './machine-search';

const rows = [{ name: 'Polar 115 Cutter' }, { name: 'Heidelberg SM74' }, { name: 'Folder Gluer' }];

describe('filterByMachineName', () => {
  it('matches a substring, ignoring case', () => {
    expect(filterByMachineName(rows, 'polar')).toEqual([{ name: 'Polar 115 Cutter' }]);
    expect(filterByMachineName(rows, 'GLU')).toEqual([{ name: 'Folder Gluer' }]);
  });
  it('a blank query keeps everything, and surrounding spaces are ignored', () => {
    expect(filterByMachineName(rows, '')).toHaveLength(3);
    expect(filterByMachineName(rows, '   ')).toHaveLength(3);
    expect(filterByMachineName(rows, ' sm74 ')).toEqual([{ name: 'Heidelberg SM74' }]);
  });
  it('no match gives an empty list', () => {
    expect(filterByMachineName(rows, 'zzz')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import { RESET_GROUPS } from './data-reset-groups';

describe('a group that wipes the stock books says so', () => {
  it.each(['customers', 'orders', 'purchasing'])('%s', (id) => {
    expect(RESET_GROUPS.find((g) => g.id === id)?.description).toContain('Also the whole stock ledger and store books, so stock reads 0.');
  });
});

import { describe, expect, it } from 'vitest';

import { CLOSED_ORDER_STATUSES, isOrderClosed, REOPENED_ORDER_STATUS } from './order-status';

describe('closed order statuses (D14)', () => {
  it.each(['CANCELLED', 'DELIVERED', 'COMPLETED'])('%s is closed', (status) => {
    expect(isOrderClosed(status)).toBe(true);
  });

  it.each(['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'QC_PENDING', ''])('%s is not closed', (status) => {
    expect(isOrderClosed(status)).toBe(false);
  });

  it('a reopened order returns to a state that is not closed — or reopening would do nothing', () => {
    expect(isOrderClosed(REOPENED_ORDER_STATUS)).toBe(false);
  });

  it('is the one list: COMPLETED was missing from the production picker before D14', () => {
    expect([...CLOSED_ORDER_STATUSES]).toContain('COMPLETED');
  });
});

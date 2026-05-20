import { describe, it, expect } from 'vitest';
import { parseActivityDateRange } from './index';

describe('parseActivityDateRange', () => {
  it('includes full end day through 23:59:59.999', () => {
    const { to } = parseActivityDateRange('2026-05-01', '2026-05-20');
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getSeconds()).toBe(59);
    expect(to.getMilliseconds()).toBe(999);
  });

  it('starts at midnight on from date', () => {
    const { from } = parseActivityDateRange('2026-05-01', '2026-05-20');
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
  });
});

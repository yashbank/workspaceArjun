/** R2-344: the next ITM code comes from one SQL aggregate, not every item row. */
import { describe, expect, it, vi } from 'vitest';

import { allocateItemCode } from './item-code';

describe('R2-344 allocateItemCode', () => {
  it('uses a single MAX() query when the client can run raw SQL and never reads every item', async () => {
    const findMany = vi.fn(async () => [{ code: 'ITM-0001' }]);
    const $queryRaw = vi.fn(async () => [{ max: BigInt(42) }]);
    const tx = { misItem: { findMany }, $queryRaw } as unknown as Parameters<typeof allocateItemCode>[0];
    expect(await allocateItemCode(tx)).toBe('ITM-0043');
    expect(await allocateItemCode(tx, 2)).toBe('ITM-0045');
    expect(findMany).not.toHaveBeenCalled();
    expect($queryRaw).toHaveBeenCalled();
  });

  it('starts at ITM-0001 on an empty table (MAX is null) and handles 5-digit numbers', async () => {
    const empty = { misItem: { findMany: async () => [] }, $queryRaw: async () => [{ max: null }] } as unknown as Parameters<typeof allocateItemCode>[0];
    expect(await allocateItemCode(empty)).toBe('ITM-0001');
    const big = { misItem: { findMany: async () => [] }, $queryRaw: async () => [{ max: 9999 }] } as unknown as Parameters<typeof allocateItemCode>[0];
    expect(await allocateItemCode(big)).toBe('ITM-10000');
  });

  it('falls back to reading codes when there is no $queryRaw (test fakes)', async () => {
    const tx = { misItem: { findMany: async () => [{ code: 'ITM-0007' }, { code: 'X-9' }] } };
    expect(await allocateItemCode(tx)).toBe('ITM-0008');
  });
});

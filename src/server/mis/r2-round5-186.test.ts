import { describe, expect, it, vi } from 'vitest';

vi.mock('./business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
const { nextTxnSeq } = await import('./store-books');

describe('R2-186', () => {
  it('R2-186: the daily STXN sequence is keyed to the factory day, not the server UTC day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T20:00:00Z')); // 01:30 on the 15th in Kolkata
    try {
      const findFirst = vi.fn().mockResolvedValue({ txnNumber: 'STXN-20261015-0007' });
      const out = await nextTxnSeq({ misStoreTransaction: { findFirst } } as never, 'Asia/Kolkata');
      expect(out).toEqual({ prefix: 'STXN-20261015-', next: 8 });
      expect((await nextTxnSeq({ misStoreTransaction: { findFirst: async () => null } } as never, 'UTC')).prefix).toBe('STXN-20261014-');
    } finally { vi.useRealTimers(); }
  });
});

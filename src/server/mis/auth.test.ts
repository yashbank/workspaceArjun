/**
 * Phase 28 — `MisForbiddenError.digest` and `isMisForbiddenError`'s digest fallback.
 *
 * The (mis) error boundary runs client-side and receives the error only after it has crossed
 * the Server Component boundary — in a production build Next replaces `message` and drops the
 * subclass, so `error.name` reads 'Error' there, not 'MisForbiddenError' (found live: every
 * permission refusal showed the generic "Something went wrong" instead of the calm forbidden
 * copy). `digest` is the one property Next carries across untouched, so `MisForbiddenError` sets
 * a fixed one and both the boundary and `isMisForbiddenError` key off it as a fallback.
 */
import { describe, expect, it } from 'vitest';

import { MisForbiddenError, isMisForbiddenError } from './auth';

describe('MisForbiddenError.digest', () => {
  it('is a fixed, recognisable fingerprint, not Next\'s per-request hash', () => {
    const a = new MisForbiddenError('orders.read');
    const b = new MisForbiddenError('wages.read', 'po-1');
    expect(a.digest).toBe('MIS_FORBIDDEN');
    expect(b.digest).toBe(a.digest);
  });
});

describe('isMisForbiddenError', () => {
  it('recognises a real instance', () => {
    expect(isMisForbiddenError(new MisForbiddenError('orders.read'))).toBe(true);
  });

  it('recognises an error that only has the right digest — the shape Next hands the client boundary in production, after message/subclass are stripped', () => {
    const stripped = Object.assign(new Error('An error occurred in the Server Components render.'), {
      digest: 'MIS_FORBIDDEN',
    });
    expect(isMisForbiddenError(stripped)).toBe(true);
  });

  it('does not mistake an ordinary error, or another digest, for a permission refusal', () => {
    expect(isMisForbiddenError(new Error('boom'))).toBe(false);
    expect(isMisForbiddenError(Object.assign(new Error('boom'), { digest: 'SOME_OTHER_HASH' }))).toBe(false);
    expect(isMisForbiddenError(null)).toBe(false);
    expect(isMisForbiddenError(undefined)).toBe(false);
  });
});

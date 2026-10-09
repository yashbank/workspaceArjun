import { describe, expect, it } from 'vitest';

import { asResult, unwrap } from './action-result';

describe('asResult / unwrap', () => {
  it('a business refusal travels as data and comes back out as the same message', async () => {
    const r = await asResult(async () => { throw new Error('Cannot issue more than is allocated'); });
    expect(r).toEqual({ ok: false, detail: 'Cannot issue more than is allocated' });
    expect(() => unwrap(r)).toThrow('Cannot issue more than is allocated');
  });
  it('success carries the value', async () => {
    const r = await asResult(async () => 42);
    expect(r).toEqual({ ok: true, value: 42 });
    expect(unwrap(r)).toBe(42);
  });
  it('a permission refusal is still thrown (the error boundary owns it)', async () => {
    const forbidden = Object.assign(new Error('Not permitted: store.write'), { digest: 'MIS_FORBIDDEN' });
    await expect(asResult(async () => { throw forbidden; })).rejects.toBe(forbidden);
  });
  it('a messageless failure gets the generic line', async () => {
    expect(await asResult(async () => { throw new Error(''); })).toEqual({ ok: false, detail: 'That did not save. Try again.' });
  });
});

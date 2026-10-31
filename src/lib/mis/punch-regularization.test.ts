import { describe, expect, it } from 'vitest';

import { validateRegularization } from './punch-regularization';

const today = '2026-10-29';
const base = { workDate: '2026-10-28', requestedIn: '09:00', requestedOut: '18:00', reason: 'Forgot to punch' };

describe('validateRegularization', () => {
  it('accepts both punches on a past day and today', () => {
    expect(validateRegularization(base, today)).toMatchObject({ ok: true });
    expect(validateRegularization({ ...base, workDate: today }, today)).toMatchObject({ ok: true });
  });
  it('accepts a single punch', () => {
    expect(validateRegularization({ ...base, requestedOut: '' }, today)).toMatchObject({ ok: true, requestedOut: null });
    expect(validateRegularization({ ...base, requestedIn: null }, today)).toMatchObject({ ok: true, requestedIn: null });
  });
  it('refuses no punch at all', () => {
    expect(validateRegularization({ ...base, requestedIn: '', requestedOut: null }, today)).toMatchObject({ ok: false });
  });
  it('refuses a future date', () => {
    expect(validateRegularization({ ...base, workDate: '2026-10-30' }, today)).toMatchObject({ ok: false, error: expect.stringMatching(/future/) });
  });
  it('refuses a malformed or impossible date', () => {
    expect(validateRegularization({ ...base, workDate: '28-10-2026' }, today)).toMatchObject({ ok: false });
    expect(validateRegularization({ ...base, workDate: '2026-02-31' }, today)).toMatchObject({ ok: false });
  });
  it('refuses out not after in, and bad times', () => {
    expect(validateRegularization({ ...base, requestedOut: '09:00' }, today)).toMatchObject({ ok: false });
    expect(validateRegularization({ ...base, requestedOut: '08:00' }, today)).toMatchObject({ ok: false });
    expect(validateRegularization({ ...base, requestedIn: '25:00' }, today)).toMatchObject({ ok: false });
  });
  it('needs a reason within the limit', () => {
    expect(validateRegularization({ ...base, reason: '  ' }, today)).toMatchObject({ ok: false });
    expect(validateRegularization({ ...base, reason: 'x'.repeat(301) }, today)).toMatchObject({ ok: false });
    expect(validateRegularization({ ...base, reason: 'x'.repeat(300) }, today)).toMatchObject({ ok: true });
  });
});

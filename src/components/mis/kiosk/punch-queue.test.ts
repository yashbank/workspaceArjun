import { describe, expect, it } from 'vitest';

import type { QueuedItem } from '@/lib/mis/offline/queue';

import { describePunchFailure, summarisePunchQueue } from './punch-queue';
import type { SentPunch } from './punch-sync-log';

const TZ = 'Asia/Kolkata';
const NOW = Date.parse('2026-09-21T02:11:00.000Z');

const item = (over: Partial<QueuedItem> = {}): QueuedItem => ({
  key: `k-${Math.random()}`,
  kind: 'attendance.punch_in',
  payload: { badgeCode: 'BPP-0142' },
  clientRecordedAt: '2026-09-21T00:34:00.000Z',
  status: 'PENDING',
  attempts: 0,
  ...over,
});
const sent = (n: number): SentPunch[] =>
  Array.from({ length: n }, (_, i) => ({ punchId: `p${i}`, employeeName: `Person ${i}`, direction: 'IN' as const, punchedAt: '2026-09-21T00:34:00.000Z' }));

describe('K2’s own numbers: “11 / 14 sent”, one failed row, “2 more waiting”', () => {
  it('sums to 14 and separates the three', () => {
    const items = [
      item({ status: 'PARKED', reason: 'BADGE_UNKNOWN', payload: { badgeCode: 'BPP-8841' }, clientRecordedAt: '2026-09-21T01:17:00.000Z' }),
      item(),
      item(),
    ];
    const s = summarisePunchQueue(items, sent(11), TZ, NOW);
    expect(s).toMatchObject({ sent: 11, waiting: 2, total: 14, visible: true });
    expect(s.failed).toHaveLength(1);
  });

  it('a stuck punch is FAILED, never counted as waiting', () => {
    const s = summarisePunchQueue([item({ status: 'PARKED', reason: 'CLOCK_SKEW' })], [], TZ, NOW);
    expect(s.waiting).toBe(0);
    expect(s.failed).toHaveLength(1);
  });

  it('shows nothing when there is nothing to show', () => {
    expect(summarisePunchQueue([], [], TZ, NOW)).toMatchObject({ visible: false, total: 0, retryInSeconds: null });
  });

  it('ignores other kinds — a production entry is not a punch', () => {
    const s = summarisePunchQueue([item({ kind: 'production.log' }), item({ kind: 'production.log', status: 'PARKED' })], [], TZ, NOW);
    expect(s.total).toBe(0);
  });

  it('says how long until the soonest retry — backoff is visible, not silent', () => {
    const s = summarisePunchQueue([item({ attempts: 2, nextAttemptAt: NOW + 45_000 }), item({ attempts: 5, nextAttemptAt: NOW + 60_000 })], [], TZ, NOW);
    expect(s.retryInSeconds).toBe(45);
  });

  it('a retry that is already due is not “retrying in 0”', () => {
    expect(summarisePunchQueue([item({ nextAttemptAt: NOW - 1000 })], [], TZ, NOW).retryInSeconds).toBeNull();
  });
});

describe('a failed row states what happened and who can fix it (K2)', () => {
  const badge = item({ status: 'PARKED', reason: 'BADGE_UNKNOWN', payload: { badgeCode: 'BPP-8841' }, clientRecordedAt: '2026-09-21T01:17:00.000Z' });

  it('“Badge not recognised — Scanned 06:47 · code BPP-8841”, on the FACTORY’s clock', () => {
    expect(describePunchFailure(badge, TZ)).toMatchObject({ titleKey: 'kiosk.fail.badgeUnknown', scanned: '06:47 · BPP-8841', canFix: true });
    // Another zone reads the same instant differently — the zone is what is used, not the browser's.
    expect(describePunchFailure(badge, 'Asia/Singapore').scanned).toBe('09:17 · BPP-8841');
  });

  it('ONLY an unrecognised badge offers Fix; everything else names who must decide', () => {
    const cases: [QueuedItem['reason'], boolean, string | null][] = [
      ['BADGE_UNKNOWN', true, null],
      ['EMPLOYEE_INACTIVE', false, 'kiosk.hint.admin'],
      ['CORRECTION_WINDOW_CLOSED', false, 'kiosk.hint.superOperator'],
      ['CLOCK_SKEW', false, 'kiosk.hint.superOperator'],
      ['TOO_OLD', false, 'kiosk.hint.superOperator'],
      ['PREDECESSOR_PARKED', false, 'kiosk.hint.superOperator'],
      ['FORBIDDEN', false, 'kiosk.hint.signIn'],
    ];
    for (const [reason, canFix, hint] of cases) {
      const f = describePunchFailure(item({ status: 'PARKED', reason }), TZ);
      expect([reason, f.canFix, f.hintKey]).toEqual([reason, canFix, hint]);
    }
  });

  it('an unrecognised reason still says something and points to a person — never a bare “failed”', () => {
    const f = describePunchFailure(item({ status: 'REJECTED', reason: 'MALFORMED' }), TZ);
    expect(f).toMatchObject({ titleKey: 'kiosk.fail.other', canFix: false, hintKey: 'kiosk.hint.superOperator' });
  });

  it('knows the direction, so the row can say in or out', () => {
    expect(describePunchFailure(item({ kind: 'attendance.punch_out', status: 'PARKED' }), TZ).direction).toBe('OUT');
  });
});

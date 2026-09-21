/**
 * Phase 24E · D12 — `scheduleBusinessRule`, the only write on the Owner's rules screen.
 *
 * D12: a change is a NEW row with a start day; nothing is edited or deleted; a reason is required; every change writes
 * an audit row. D24/D25: only the Owner (`wages.read` is the marker) may schedule — an Admin holds `settings.write`
 * and is still refused, because this reaches the wage rates and the AQL limits. All eight roles are tried.
 * F-04: a wage rule's audit row names the rule, never the figure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Rule = { id: string; ruleKey: string; ruleValue: string; valueType: string; label: string; description: string | null; effectiveFrom: Date; updatedById: string | null };
type Audit = { actorId: string | null; action: string; entity: string; entityId: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
const rules: Rule[] = [];
const audits: Audit[] = [];
let n = 0;
let createFails: unknown = null;

vi.mock('@/server/db', () => ({
  db: {
    misBusinessRule: {
      findFirst: async ({ where, orderBy }: { where: { ruleKey: string; effectiveFrom?: { lte: Date } }; orderBy?: unknown }) => {
        const hits = rules.filter((r) => r.ruleKey === where.ruleKey && (!where.effectiveFrom || r.effectiveFrom <= where.effectiveFrom.lte));
        return (orderBy ? [...hits].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()) : hits)[0] ?? null;
      },
      findMany: async ({ where }: { where: { ruleKey: string } }) => rules.filter((r) => r.ruleKey === where.ruleKey),
      create: async ({ data }: { data: Omit<Rule, 'id'> }) => {
        if (createFails) throw createFails;
        const row = { ...data, id: `r${(n += 1)}` } as Rule;
        rules.push(row);
        return row;
      },
    },
    misAuditLog: { create: async ({ data }: { data: Audit }) => void audits.push(data) },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { scheduleBusinessRule, getRuleValue } = await import('./business-rules');

const row = (id: string, ruleKey: string, ruleValue: string, from: string, valueType = 'number'): Rule => ({ id, ruleKey, ruleValue, valueType, label: ruleKey, description: null, effectiveFrom: new Date(`${from}T00:00:00Z`), updatedById: null });
const ask = (over: Partial<Parameters<typeof scheduleBusinessRule>[0]> = {}) => scheduleBusinessRule({ ruleKey: 'AQL_MAJOR_MAX', ruleValue: '1', effectiveFrom: '2026-10-01', reason: 'Tightening after the ink change', ...over });
const as = (role: MisRoleName) => { getCurrentUser.mockResolvedValue({ id: 'owner-1' }); getMisRole.mockResolvedValue(role); };
const forbidden = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch (e) { return (e as Error).name === 'MisForbiddenError'; } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-07T05:00:00Z')); // the factory's 07 Sep, 10:30
  rules.length = 0;
  audits.length = 0;
  n = 0;
  createFails = null;
  rules.push(row('a', 'factory.timezone', 'Asia/Kolkata', '2024-01-01', 'string'), row('b', 'AQL_MAJOR_MAX', '2', '2026-07-01'), row('c', 'OT_MULTIPLIER', '1.5', '2026-01-01'), row('d', 'DAILY_WAGE_DEFAULT', '731.19', '2026-01-01'));
  as('OWNER');
});
afterEach(() => vi.useRealTimers());

describe('who may schedule a change — every role tried, D24/D25', () => {
  const OWNER_ONLY: MisRoleName[] = ['OWNER'];
  it.each(MIS_ROLES.map((r) => [r] as const))('%s', async (role) => {
    as(role);
    const before = rules.length;
    if (OWNER_ONLY.includes(role)) {
      await expect(ask()).resolves.toBeDefined();
      expect(rules).toHaveLength(before + 1);
      expect(audits).toHaveLength(1);
    } else {
      expect(await forbidden(() => ask())).toBe(true);
      // A refusal writes nothing at all: no row and no audit row.
      expect(rules).toHaveLength(before);
      expect(audits).toHaveLength(0);
    }
  });

  it('an ADMIN — who holds settings.write and may edit the general list — is refused here, for a wage key and an AQL key alike', async () => {
    as('ADMIN');
    expect(await forbidden(() => ask({ ruleKey: 'DAILY_WAGE_DEFAULT', ruleValue: '900' }))).toBe(true);
    expect(await forbidden(() => ask({ ruleKey: 'AQL_MAJOR_MAX' }))).toBe(true);
    expect(rules.find((r) => r.ruleKey === 'DAILY_WAGE_DEFAULT' && r.ruleValue === '900')).toBeUndefined();
  });
});

describe('a change adds a row and edits nothing', () => {
  it('writes one new row starting on the chosen FACTORY day and leaves every earlier row byte-identical', async () => {
    const before = JSON.stringify(rules);
    const rec = await ask();
    expect(rules).toHaveLength(5);
    expect(JSON.stringify(rules.slice(0, 4))).toBe(before);
    expect(rec).toMatchObject({ ruleKey: 'AQL_MAJOR_MAX', ruleValue: '1', updatedById: 'owner-1' });
    expect(rec.effectiveFrom.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('copies the rule\'s type, label and description from its newest row', async () => {
    const rec = await ask({ ruleKey: 'OT_MULTIPLIER', ruleValue: '2' });
    expect(rec).toMatchObject({ valueType: 'number', label: 'OT_MULTIPLIER' });
  });

  it('the value is trimmed before it is stored', async () => {
    const rec = await ask({ ruleValue: '  3  ' });
    expect(rec.ruleValue).toBe('3');
    expect(audits[0].after?.ruleValue).toBe('3');
  });

  it('a starting day of TODAY (the factory\'s) is accepted; yesterday is not', async () => {
    await expect(ask({ effectiveFrom: '2026-09-07' })).resolves.toBeDefined();
    await expect(ask({ ruleKey: 'OT_MULTIPLIER', effectiveFrom: '2026-09-06' })).rejects.toThrow(/past/);
  });

  it('the factory day, not the server\'s: at 21:00Z the plant is already on the 8th, so the 7th is the past', async () => {
    vi.setSystemTime(new Date('2026-09-07T21:00:00Z')); // 08 Sep 02:30 IST
    await expect(ask({ effectiveFrom: '2026-09-07' })).rejects.toThrow(/past/);
    await expect(ask({ effectiveFrom: '2026-09-08' })).resolves.toBeDefined();
  });

  it('the new row is invisible to the value in force today — read through the real reader, not a copy of it', async () => {
    await ask();
    expect(await getRuleValue('AQL_MAJOR_MAX')).toBe('2');
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    expect(await getRuleValue('AQL_MAJOR_MAX')).toBe('1');
  });
});

describe('the audit "before" is the value the new row REPLACES', () => {
  it('with 1.5 already scheduled for October, a change starting in September replaces 2.0 (in force then), not 1.5', async () => {
    rules.push(row('up', 'AQL_MAJOR_MAX', '1.5', '2026-10-01'));
    await ask({ ruleValue: '1', effectiveFrom: '2026-09-20' });
    expect(audits[0].before).toEqual({ ruleKey: 'AQL_MAJOR_MAX', ruleValue: '2' });
  });

  it('a change starting AFTER the scheduled one replaces the scheduled one', async () => {
    rules.push(row('up', 'AQL_MAJOR_MAX', '1.5', '2026-10-01'));
    await ask({ ruleValue: '1', effectiveFrom: '2026-11-01' });
    expect(audits[0].before).toEqual({ ruleKey: 'AQL_MAJOR_MAX', ruleValue: '1.5' });
  });
});

describe('a value the reader would silently ignore is refused (it would be shown as in force but never used)', () => {
  it.each([
    ['line_clearance.mode', 'shift', /one of/],
    ['ATTENDANCE_CORRECTION_DAYS', '0', /1 or more/],
    ['AQL_SAMPLE_SIZE', '1.5', /whole number/],
    ['AQL_SAMPLE_SIZE', '0x10', /whole number/],
    ['OT_MULTIPLIER', '1e3', /number/],
  ])('%s = %s', async (ruleKey, ruleValue, message) => {
    rules.push(row('x', ruleKey, ruleKey === 'line_clearance.mode' ? 'JOB' : '3', '2026-01-01', ruleKey === 'line_clearance.mode' ? 'string' : 'number'));
    const before = rules.length;
    await expect(ask({ ruleKey, ruleValue })).rejects.toThrow(message);
    expect(rules).toHaveLength(before);
    expect(audits).toHaveLength(0);
  });

  it('a reason over 500 characters is refused on the server, not only by the textarea', async () => {
    await expect(ask({ reason: 'x'.repeat(501) })).rejects.toThrow(/at most 500/);
    expect(rules).toHaveLength(4);
  });
});

describe('two people scheduling the same day at once', () => {
  it('the database constraint wins, and the message is words — never the table or constraint name', async () => {
    createFails = Object.assign(new Error('Unique constraint failed on the fields: (`rule_key`,`effective_from`) mis_business_rules'), { code: 'P2002' });
    const failure = await ask().catch((e: Error) => e);
    expect((failure as Error).message).toBe('A row for this rule already starts on that day. Nothing is edited — pick another day.');
    expect(audits).toHaveLength(0);
  });

  it('any other failure is not disguised as that one', async () => {
    createFails = new Error('connection reset');
    await expect(ask()).rejects.toThrow('connection reset');
  });
});

describe('every refusal writes nothing', () => {
  it.each([
    ['no reason', { reason: '' }, /reason is required/],
    ['a blank reason', { reason: '   ' }, /reason is required/],
    ['no value', { ruleValue: ' ' }, /new value is required/],
    ['text for a number rule', { ruleValue: 'lots' }, /number/],
    ['not a real day', { effectiveFrom: '2026-02-30' }, /real date/],
    ['a day in the past that already has a row', { effectiveFrom: '2026-07-01' }, /cannot start in the past/],
    ['an unknown rule', { ruleKey: 'nope.nothing' }, /not found/],
    ['a timezone abbreviation', { ruleKey: 'factory.timezone', ruleValue: 'IST' }, /IANA/],
  ])('%s', async (_name, over, message) => {
    await expect(ask(over)).rejects.toThrow(message);
    expect(rules).toHaveLength(4);
    expect(audits).toHaveLength(0);
  });

  it('a second row on a day that already has one is refused in words', async () => {
    await ask({ effectiveFrom: '2026-10-01' });
    await expect(ask({ effectiveFrom: '2026-10-01', ruleValue: '3' })).rejects.toThrow(/already starts on that day/);
    expect(rules.filter((r) => r.ruleKey === 'AQL_MAJOR_MAX')).toHaveLength(2);
  });
});

describe('every change writes an audit row — with the reason', () => {
  it('names the actor, the action, the entity, the day and the reason; before and after carry the old and new value', async () => {
    const rec = await ask();
    expect(audits).toEqual([
      {
        actorId: 'owner-1', action: 'SCHEDULE_RULE', entity: 'MisBusinessRule', entityId: rec.id, ip: null,
        before: { ruleKey: 'AQL_MAJOR_MAX', ruleValue: '2' },
        after: { ruleKey: 'AQL_MAJOR_MAX', ruleValue: '1', effectiveFrom: '2026-10-01', reason: 'Tightening after the ink change' },
      },
    ]);
  });

  it('the reason is trimmed', async () => {
    await ask({ reason: '  Two lines for the auditor  ' });
    expect(audits[0].after?.reason).toBe('Two lines for the auditor');
  });

  it('F-04: a WAGE rule\'s audit row names the rule and carries no figure — old or new', async () => {
    await ask({ ruleKey: 'DAILY_WAGE_DEFAULT', ruleValue: '812.5', reason: 'Annual revision' });
    expect(audits).toHaveLength(1);
    expect(audits[0].before).toEqual({ ruleKey: 'DAILY_WAGE_DEFAULT' });
    expect(audits[0].after).toEqual({ ruleKey: 'DAILY_WAGE_DEFAULT', effectiveFrom: '2026-10-01', reason: 'Annual revision' });
    const text = JSON.stringify(audits);
    expect(text).not.toContain('812.5');
    expect(text).not.toContain('731.19');
  });

  it('the older write paths still write their audit as before — no effectiveFrom or reason unless one was given', async () => {
    const { updateAqlThreshold } = await import('./business-rules');
    await updateAqlThreshold('AQL_MAJOR_MAX', '1');
    expect(audits[0]).toMatchObject({ action: 'UPDATE_RULE', after: { ruleKey: 'AQL_MAJOR_MAX', ruleValue: '1' } });
    expect(audits[0].after).not.toHaveProperty('reason');
    expect(audits[0].after).not.toHaveProperty('effectiveFrom');
  });
});

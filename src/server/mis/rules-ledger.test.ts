/**
 * Phase 24E · D12 — `getRulesLedger` at the SERVER FUNCTION.
 *
 * Owner only (`wages.read`, D24/D25): all eight roles are tried, and a refused role reaches no query. The Owner sees
 * the wage rates and AQL limits because this is the one screen that changes them; nothing here is reachable by anyone
 * else, and the audit reasons are read only for the rule rows on screen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const queries: string[] = [];
const world: { zone: string; rules: Row[]; audits: Row[]; people: Row[] } = { zone: 'Asia/Kolkata', rules: [], audits: [], people: [] };

vi.mock('@/server/db', () => ({
  db: {
    misBusinessRule: { findMany: async () => { queries.push('rules'); return world.rules; } },
    misAuditLog: {
      findMany: async (a: { where: { entity: string; entityId: { in: string[] }; action: string } }) => {
        queries.push('audit');
        return world.audits.filter((x) => a.where.entityId.in.includes(x.entityId as string) && x.entity === a.where.entity && x.action === a.where.action);
      },
    },
    userProfile: { findMany: async (a: { where: { id: { in: string[] } } }) => { queries.push('people'); return world.people.filter((p) => a.where.id.in.includes(p.id as string)); } },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => world.zone }));

const { getRulesLedger } = await import('./rules-ledger');

const NOW = new Date('2026-09-07T05:00:00Z');
const r = (id: string, ruleKey: string, ruleValue: string, from: string, over: Row = {}): Row => ({ id, ruleKey, ruleValue, valueType: 'number', label: ruleKey, description: null, effectiveFrom: new Date(`${from}T00:00:00Z`), updatedById: 'p1', updatedAt: NOW, ...over });
const as = (role: MisRoleName) => { getCurrentUser.mockResolvedValue({ id: 'u1' }); getMisRole.mockResolvedValue(role); };
const forbidden = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch (e) { return (e as Error).name === 'MisForbiddenError'; } };

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  world.zone = 'Asia/Kolkata';
  world.rules = [r('a1', 'AQL_MAJOR_MAX', '2', '2026-07-01'), r('a2', 'AQL_MAJOR_MAX', '1', '2026-10-01'), r('w1', 'DAILY_WAGE_DEFAULT', '731', '2026-01-01', { updatedById: null }), r('o1', 'OT_MULTIPLIER', '1.5', '2026-01-01')];
  world.audits = [{ entityId: 'a2', entity: 'MisBusinessRule', action: 'SCHEDULE_RULE', after: { reason: 'Tightening after the ink change' } }, { entityId: 'a1', entity: 'MisBusinessRule', action: 'UPDATE_RULE', after: { reason: 'ignored: not a schedule row' } }];
  world.people = [{ id: 'p1', name: 'A. Bhaskar' }];
});

describe('who may read the ledger — every role tried', () => {
  it.each(MIS_ROLES.map((role) => [role] as const))('%s', async (role) => {
    as(role);
    if (role === 'OWNER') {
      await expect(getRulesLedger({}, NOW)).resolves.toMatchObject({ todayKey: '2026-09-07' });
    } else {
      expect(await forbidden(() => getRulesLedger({}, NOW))).toBe(true);
      expect(queries).toEqual([]); // a refused role reaches no query at all
    }
  });
});

describe('the ledger the Owner reads', () => {
  it('reads the value in force today, the scheduled row, and the reason from the audit row that wrote it', async () => {
    as('OWNER');
    const l = await getRulesLedger({}, NOW);
    const aql = l.rules.find((x) => x.ruleKey === 'AQL_MAJOR_MAX')!;
    expect(aql).toMatchObject({ value: '2', from: '2026-07-01', scheduled: { value: '1', from: '2026-10-01' } });
    expect(aql.history[0]).toMatchObject({ value: '1', status: 'scheduled', by: 'A. Bhaskar', reason: 'Tightening after the ink change' });
    expect(aql.history[1]).toMatchObject({ status: 'inforce', reason: null }); // an UPDATE_RULE audit row is not a reason
    expect(l.scheduledCount).toBe(1);
  });

  it('a seeded row (no author) says so; it is not credited to anyone', async () => {
    as('OWNER');
    const wage = (await getRulesLedger({}, NOW)).rules.find((x) => x.ruleKey === 'DAILY_WAGE_DEFAULT')!;
    expect(wage.history[0]).toMatchObject({ seeded: true, by: null });
  });

  it('flags the wage and AQL keys as the ones payroll pays and QC accepts', async () => {
    as('OWNER');
    expect((await getRulesLedger({}, NOW)).sensitiveKeys.sort()).toEqual(['AQL_MAJOR_MAX', 'DAILY_WAGE_DEFAULT', 'OT_MULTIPLIER']); // OT_MULTIPLIER is a wage rule too
  });

  it('reads as of a chosen day; a malformed day falls back to today, never to an error', async () => {
    as('OWNER');
    expect((await getRulesLedger({ asOf: '2026-10-05' }, NOW)).rules.find((x) => x.ruleKey === 'AQL_MAJOR_MAX')!.value).toBe('1');
    expect((await getRulesLedger({ asOf: '2026-06-30' }, NOW)).rules.find((x) => x.ruleKey === 'AQL_MAJOR_MAX')!.value).toBeNull();
    for (const asOf of ['tomorrow', '2026-02-30', 7, ['2026-10-05'], null]) expect((await getRulesLedger({ asOf }, NOW)).asOf).toBe('2026-09-07');
  });

  it('"today" is the FACTORY\'s day: at 21:00Z the plant is already on the 8th', async () => {
    as('OWNER');
    expect((await getRulesLedger({}, new Date('2026-09-07T21:00:00Z'))).todayKey).toBe('2026-09-08');
  });

  it('selects the rule asked for, else the first; an unknown key selects the first, never nothing', async () => {
    as('OWNER');
    expect((await getRulesLedger({ rule: 'OT_MULTIPLIER' }, NOW)).selectedKey).toBe('OT_MULTIPLIER');
    const first = (await getRulesLedger({}, NOW)).rules[0].ruleKey;
    expect((await getRulesLedger({ rule: 'nope' }, NOW)).selectedKey).toBe(first);
    expect((await getRulesLedger({ rule: 42 }, NOW)).selectedKey).toBe(first);
  });

  it('no rules at all is an empty ledger, and no audit or people query is made for nothing', async () => {
    as('OWNER');
    world.rules = [];
    expect(await getRulesLedger({}, NOW)).toMatchObject({ rules: [], selectedKey: null, scheduledCount: 0 });
    expect(queries).toEqual(['rules']);
  });
});

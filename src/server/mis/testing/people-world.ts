/**
 * An in-memory org chart for the visibility / employee tests (Phase 14).
 *
 * The Phase 2 stamp is the reason this exists: `visibility.ts` narrows only once an org chart
 * is entered, so a fixture with no `managerId` returns UNSCOPED for every role and a naive
 * "supervisor cannot see X" test passes for the wrong reason. This world always has a real
 * tree unless a test deliberately flattens it.
 *
 *   OWNER e-own
 *   ├─ ADMIN e-adm ── SUPERVISOR e-supA ── WORKER w1, w2 (and a deleted w4)
 *   │             ├─ SUPERVISOR e-supB ── WORKER w3
 *   │             └─ QC e-qc
 *   └─ ADMIN e-adm2 ── ATTENDANCE_OPERATOR e-att
 *   WORKER e-orphan (no manager — a partially entered chart)
 *
 * Test-only. Nothing in the app imports this.
 */
import type { MisRoleName } from '@/lib/mis/roles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a fake db row is whatever the test seeds
export type Person = Record<string, any>;

const person = (id: string, role: MisRoleName, managerId: string | null, extra: Person = {}): Person => ({
  id,
  employeeCode: id.toUpperCase(),
  name: `Name ${id}`,
  nameHi: null,
  role,
  managerId,
  departmentId: null,
  isActive: true,
  deletedAt: null,
  userProfileId: null,
  userProfile: null,
  ...extra,
});

export const world: { people: Person[]; queries: { where: Person }[]; writes: string[] } = { people: [], queries: [], writes: [] };

/** login id → the employee it belongs to */
export const LOGIN: Record<string, string> = {
  'u-own': 'e-own',
  'u-adm': 'e-adm',
  'u-adm2': 'e-adm2',
  'u-supA': 'e-supA',
  'u-supB': 'e-supB',
  'u-qc': 'e-qc',
  'u-att': 'e-att',
};

export function seedPeople(opts: { flat?: boolean } = {}) {
  const link = (id: string | null) => (opts.flat ? null : id);
  world.queries = [];
  world.writes = [];
  world.people = [
    person('e-own', 'OWNER', null, { userProfileId: 'u-own' }),
    person('e-adm', 'ADMIN', link('e-own'), { userProfileId: 'u-adm' }),
    person('e-adm2', 'ADMIN', link('e-own'), { userProfileId: 'u-adm2' }),
    person('e-supA', 'SUPERVISOR', link('e-adm'), { userProfileId: 'u-supA' }),
    person('e-supB', 'SUPERVISOR', link('e-adm'), { userProfileId: 'u-supB' }),
    person('e-qc', 'QC', link('e-adm'), { userProfileId: 'u-qc' }),
    person('e-att', 'ATTENDANCE_OPERATOR', link('e-adm2'), { userProfileId: 'u-att' }),
    person('w1', 'WORKER', link('e-supA')),
    person('w2', 'WORKER', link('e-supA')),
    person('w3', 'WORKER', link('e-supB')),
    person('w4', 'WORKER', link('e-supA'), { deletedAt: new Date('2026-01-01'), isActive: false }),
    person('e-orphan', 'WORKER', null),
  ];
}

const matches = (row: Person, where: Person = {}): boolean =>
  Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const ops = Object.keys(cond);
      if (!ops.every((op) => op === 'in' || op === 'not')) throw new Error(`people fake: unsupported operator ${JSON.stringify(cond)}`);
      if ('in' in cond && !cond.in.includes(value)) return false;
      if ('not' in cond && value === cond.not) return false;
      return true;
    }
    return value === cond;
  });

const pick = (row: Person, select?: Person) =>
  select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) : row;

export const fakePeopleDb = {
  misEmployee: {
    findMany: async (args: Person = {}) => {
      world.queries.push({ where: args.where ?? {} });
      const rows = world.people.filter((r) => matches(r, args.where));
      if (args.orderBy?.name) rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows.map((r) => ({ ...pick(r, args.select) }));
    },
    findFirst: async (args: Person = {}) => {
      const row = world.people.find((r) => matches(r, args.where));
      return row ? pick(row, args.select) : null;
    },
    // Real Prisma returns a snapshot, never the stored object — a live reference would make
    // every `before` in an audit payload silently equal its `after`.
    findUnique: async (args: Person) => {
      const row = world.people.find((r) => matches(r, args.where));
      return row ? { ...row } : null;
    },
    create: async ({ data }: Person) => {
      world.writes.push('create');
      const row = person(`new-${world.people.length}`, data.role ?? 'WORKER', null, data);
      world.people.push(row);
      return { ...row };
    },
    update: async ({ where, data }: Person) => {
      world.writes.push('update');
      const row = world.people.find((r) => r.id === where.id);
      if (!row) throw new Error('P2025 record not found');
      Object.assign(row, data);
      return { ...row };
    },
    count: async (args: Person = {}) => world.people.filter((r) => matches(r, args.where)).length,
  },
  misWorkerAllocation: { findMany: async () => [] },
  misAttendance: { findMany: async () => [] },
  misLeaveRequest: { findMany: async () => [] },
};

/** The roles module as the tests see it: a login's role and employee row come from the world. */
export const rolesModule = {
  getMisRole: async (userId: string) => {
    const emp = world.people.find((p) => p.userProfileId === userId);
    return emp && !emp.deletedAt && emp.isActive ? (emp.role as MisRoleName) : null;
  },
  getMisEmployee: async (userId: string) => world.people.find((p) => p.userProfileId === userId) ?? null,
};

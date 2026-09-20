/**
 * An in-memory stand-in for the tables the offline write path touches — test
 * support only, imported by `*.test.ts` files and nothing else.
 *
 * It exists because the tests that came before it mocked `upsert` and counted
 * calls, and a call count cannot tell whether a business row and its idempotency
 * row are atomic. This models what actually matters:
 *
 *  - `$transaction` **stages** writes and commits them together, or discards
 *    them all if the callback throws — so "the production log rolled back with
 *    the key" is something a test can observe, not assume;
 *  - `create` on an existing key throws Prisma's unique-violation, `P2002`, the
 *    way the real primary key does — so a lost race is reproducible;
 *  - reads of the tables the gates consult (orders, machines, clearances,
 *    phases, business rules) come from plain mutable maps a test edits.
 */

type Row = Record<string, unknown>;

export type FakeState = {
  queued: Map<string, Row>;
  logs: Row[];
  orders: Map<string, { orderNumber: string; status: string }>;
  machines: Map<string, { name: string }>;
  clearances: Row[];
  phases: Row[];
  rules: Record<string, string>;
  // Phase 13 — punches. Same rule as the rest: staged in a transaction, committed together.
  punches: Row[];
  attendance: Row[];
  employees: Row[];
  shifts: Row[];
};

const unique = () => Object.assign(new Error('Unique constraint failed on the fields: (`key`)'), { code: 'P2002' });

function queuedApi(get: () => FakeState, hooks: { failOn?: string }) {
  return {
    findUnique: async ({ where }: { where: { key: string } }) => {
      const row = get().queued.get(where.key);
      return row ? { ...row } : null;
    },
    create: async ({ data }: { data: Row }) => {
      const key = data.key as string;
      if (get().queued.has(key)) throw unique();
      get().queued.set(key, { ...data });
      return { ...data };
    },
    updateMany: async ({ where, data }: { where: { key: string } & Row; data: Row }) => {
      const row = get().queued.get(where.key);
      // Every condition must hold, as in the database: a claim on the wrong status — or a
      // resolve scoped to the wrong device — matches nothing.
      if (!row || Object.entries(where).some(([k, v]) => (v === null ? (row[k] ?? null) !== null : row[k] !== v))) {
        return { count: 0 };
      }
      get().queued.set(where.key, { ...row, ...data });
      return { count: 1 };
    },
    update: async ({ where, data }: { where: { key: string }; data: Row }) => {
      if (hooks.failOn === 'queued.update') {
        hooks.failOn = undefined;
        throw new Error('simulated failure finalising the key row');
      }
      const row = get().queued.get(where.key);
      if (!row) throw new Error('record not found');
      get().queued.set(where.key, { ...row, ...data });
      return { ...row, ...data };
    },
    upsert: async ({ where, create, update }: { where: { key: string }; create: Row; update: Row }) => {
      const row = get().queued.get(where.key);
      const next = row ? { ...row, ...update } : { ...create };
      get().queued.set(where.key, next);
      return next;
    },
  };
}

export function createFakeDb() {
  const state: FakeState = {
    queued: new Map(),
    logs: [],
    orders: new Map(),
    machines: new Map(),
    clearances: [],
    phases: [],
    rules: {
      'offline.clock_skew_minutes': '15',
      'offline.max_queue_age_hours': '72',
      'factory.timezone': 'Asia/Kolkata',
      'ATTENDANCE_CORRECTION_DAYS': '3',
    },
    punches: [],
    attendance: [],
    employees: [],
    shifts: [],
  };
  const hooks: { failOn?: string } = {};
  let nextLog = 1;
  let nextPunch = 1;
  let nextAttendance = 1;

  const logsApi = (get: () => FakeState) => ({
    create: async ({ data }: { data: Row }) => {
      const rec = { id: `log-${nextLog++}`, loggedAt: new Date(), ...data };
      get().logs.push(rec);
      return { ...rec };
    },
  });


  /** `supersededBy: null` — no other punch names this one as the one it replaces. */
  const punchesApi = (get: () => FakeState) => ({
    findMany: async ({ where }: { where: { employeeId: string; punchedAt: { gte: Date; lte: Date }; supersededBy?: null } }) =>
      get().punches
        .filter((p) => p.employeeId === where.employeeId)
        .filter((p) => (p.punchedAt as Date) >= where.punchedAt.gte && (p.punchedAt as Date) <= where.punchedAt.lte)
        .filter((p) => where.supersededBy !== null || !get().punches.some((q) => q.supersedesId === p.id))
        .map((p) => ({ ...p })),
    create: async ({ data }: { data: Row }) => {
      if (get().punches.some((p) => p.idempotencyKey === data.idempotencyKey)) throw unique();
      const rec = { id: `punch-${nextPunch++}`, supersedesId: null, receivedAt: new Date(), ...data };
      get().punches.push(rec);
      return { ...rec };
    },
    // The real table has a trigger that refuses these. The fake refuses them too, so a
    // test that ever tried to edit a punch would fail here as it would in the database.
    update: async () => {
      throw new Error('mis_attendance_punch_immutable: punches are never updated — record a correction instead');
    },
    delete: async () => {
      throw new Error('mis_attendance_punch_immutable: punches are never deleted — record a correction instead');
    },
  });

  const attendanceApi = (get: () => FakeState) => ({
    findUnique: async ({ where }: { where: { employeeId_date: { employeeId: string; date: Date } } }) => {
      const { employeeId, date } = where.employeeId_date;
      const row = get().attendance.find((a) => a.employeeId === employeeId && (a.date as Date).getTime() === date.getTime());
      return row ? { ...row } : null;
    },
    create: async ({ data }: { data: Row }) => {
      if (hooks.failOn === 'attendance.write') {
        hooks.failOn = undefined;
        throw new Error('simulated failure writing the attendance day');
      }
      if (get().attendance.some((a) => a.employeeId === data.employeeId && (a.date as Date).getTime() === (data.date as Date).getTime())) throw unique();
      const rec = { id: `att-${nextAttendance++}`, editedAt: null, approvedOut: false, lateMinutes: 0, otMinutes: 0, notes: null, clockIn: null, clockOut: null, ...data };
      get().attendance.push(rec);
      return { ...rec };
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      if (hooks.failOn === 'attendance.write') {
        hooks.failOn = undefined;
        throw new Error('simulated failure writing the attendance day');
      }
      const row = get().attendance.find((a) => a.id === where.id);
      if (!row) throw new Error('record not found');
      Object.assign(row, data);
      return { ...row };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const i = get().attendance.findIndex((a) => a.id === where.id);
      if (i < 0) throw new Error('record not found');
      return get().attendance.splice(i, 1)[0];
    },
  });

  const employeesApi = (get: () => FakeState) => ({
    findFirst: async ({ where }: { where: { employeeCode: string } }) => {
      const row = get().employees.find((e) => e.employeeCode === where.employeeCode);
      return row ? { ...row } : null;
    },
  });

  const db = {
    misQueuedWrite: queuedApi(() => state, hooks),
    misAttendancePunch: punchesApi(() => state),
    misAttendance: attendanceApi(() => state),
    misEmployee: employeesApi(() => state),
    misProductionLog: logsApi(() => state),

    misOrder: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const order = state.orders.get(where.id);
        return order ? { id: where.id, ...order } : null;
      },
    },
    misMachine: {
      findUnique: async ({ where }: { where: { id: string } }) => state.machines.get(where.id) ?? null,
    },
    misLineClearance: {
      findFirst: async ({ where }: { where: { machineId: string } }) => {
        const rows = state.clearances.filter((c) => c.machineId === where.machineId);
        return rows.sort((a, b) => (b.clearedAt as Date).getTime() - (a.clearedAt as Date).getTime())[0] ?? null;
      },
    },
    misMachineAllocation: { findFirst: async () => null },
    misShift: {
      findUnique: async () => null,
      findMany: async () => state.shifts.filter((sh) => sh.isActive !== false).map((sh) => ({ ...sh })),
    },
    misJobPhase: {
      findMany: async ({ where }: { where: { orderId: string } }) =>
        state.phases.filter((p) => p.orderId === where.orderId),
      findFirst: async () => null,
    },
    misBusinessRule: {
      findFirst: async ({ where }: { where: { ruleKey: string } }) =>
        where.ruleKey in state.rules ? { ruleKey: where.ruleKey, ruleValue: state.rules[where.ruleKey] } : null,
      create: async () => ({}),
    },

    /** Stages writes to the queue and log tables; commits all of them or none. */
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const staged: FakeState = {
        ...state,
        queued: new Map([...state.queued].map(([k, v]) => [k, { ...v }])),
        logs: state.logs.map((l) => ({ ...l })),
        punches: state.punches.map((p) => ({ ...p })),
        attendance: state.attendance.map((a) => ({ ...a })),
      };
      const get = () => staged;
      const tx = {
        misQueuedWrite: queuedApi(get, hooks),
        misProductionLog: logsApi(get),
        misAttendancePunch: punchesApi(get),
        misAttendance: attendanceApi(get),
        misEmployee: employeesApi(get),
        misShift: db.misShift,
      };
      const result = await fn(tx);
      state.queued = staged.queued;
      state.logs = staged.logs;
      state.punches = staged.punches;
      state.attendance = staged.attendance;
      return result;
    },
  };

  return { db, state, hooks };
}

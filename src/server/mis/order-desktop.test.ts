/**
 * Phase 24C · D4 — the order detail view model, at the SERVER FUNCTION.
 *
 * Three things are defended:
 *  1. It is a second view of the same data: it composes the phone layer's functions and never
 *     queries a table itself (the database is a trap that throws).
 *  2. NO MONEY (D4's own words). The Owner's `getBom` carries a rate; the view must still hold no
 *     rate, no rupee and no cost — asserted on the serialised payload for every role that can
 *     open the screen, not on what a component draws.
 *  3. The sign-off action is present-and-explaining while blocked, and absent — never disabled —
 *     for a role that may not act on it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

const IST = 'Asia/Kolkata';
const ist = (hh: number, mm = 0, day = 7) => new Date(Date.UTC(2026, 8, day, hh, mm) - 5.5 * 3_600_000);
const NOW = ist(9, 30);

const calls: string[] = [];
const spy = <T,>(name: string, value: T) => async () => {
  calls.push(name);
  return value;
};

// A trap: this module must reach data only through the composed functions.
vi.mock('@/server/db', () => ({
  db: new Proxy({}, { get: () => { throw new Error('order-desktop.ts must not query the database itself'); } }),
}));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const fixture = {
  order: null as null | Record<string, unknown>,
  phases: [] as Record<string, unknown>[],
  bom: null as null | Record<string, unknown>,
  qc: [] as Record<string, unknown>[],
  docs: [] as Record<string, unknown>[],
  logs: [] as Record<string, unknown>[],
  schedule: new Map<string, unknown>(),
  shift: null as null | Record<string, unknown>,
  summary: null as null | Record<string, unknown>,
};

vi.mock('./orders', () => ({ getOrder: async () => { calls.push('getOrder'); return fixture.order; } }));
vi.mock('./job-phases', () => ({
  getPhasesForOrder: async () => { calls.push('getPhasesForOrder'); return fixture.phases; },
  getSignOffSummary: async () => { calls.push('getSignOffSummary'); return fixture.summary; },
}));
vi.mock('./bom', () => ({ getBom: async () => { calls.push('getBom'); return fixture.bom; } }));
vi.mock('./qc', () => ({ getQcForOrder: async () => { calls.push('getQcForOrder'); return fixture.qc; } }));
vi.mock('./documents', () => ({ listDocuments: async () => { calls.push('listDocuments'); return fixture.docs; } }));
vi.mock('./production', () => ({ getProductionForOrder: async () => { calls.push('getProductionForOrder'); return fixture.logs; } }));
vi.mock('./machines-board', () => ({ getOrderSchedule: async () => { calls.push('getOrderSchedule'); return fixture.schedule; } }));
vi.mock('./shift-view', () => ({ getFactoryShiftWindow: async () => { calls.push('getFactoryShiftWindow'); return fixture.shift; } }));
vi.mock('./business-rules', () => ({ getFactoryTimezone: async () => IST }));

const { getOrderDesktopView } = await import('./order-desktop');
void spy;

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const REFUSED = MIS_ROLES.filter((r) => !READERS.includes(r));
const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};

const phase = (sequence: number, status: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: `p${sequence}`,
  sequence,
  status,
  process: { name, nameHi: null },
  inCharge: null,
  signedOffAt: null,
  startedAt: null,
  ...extra,
});

/** D4's own order: line clearance signed, printing running, the rest not started. */
function seedD4() {
  fixture.order = {
    id: 'o1', orderNumber: 'ORD-2026-118', description: 'Duplex carton · FBB 300 gsm', status: 'IN_PROGRESS',
    customer: { name: 'Acme Cartons' }, createdAt: ist(9, 0, 1), deliveryDate: new Date('2026-09-18T00:00:00Z'),
  };
  fixture.phases = [
    phase(1, 'SIGNED_OFF', 'Line clearance', { signedOffAt: ist(6, 12) }),
    phase(2, 'IN_PROGRESS', 'Printing', { startedAt: ist(6, 40), inCharge: { name: 'Ramesh Kumar' } }),
    phase(3, 'PENDING', 'Lamination'),
    phase(4, 'PENDING', 'Die cutting'),
  ];
  fixture.schedule = new Map([['p2', { machineName: 'Heidelberg SM 74', startsAt: ist(6), endsAt: ist(14), operators: 4 }]]);
  fixture.logs = [{ jobPhaseId: 'p2', qtyProduced: 40850, qtyWaste: 18.5 }];
  fixture.qc = [
    { checkTime: ist(6, 10), result: 'PASS' },
    { checkTime: ist(9, 5), result: 'FAIL', parameterName: 'Shade', defectType: 'major', acknowledgedAt: null },
  ];
  fixture.docs = [{ id: 'd1', name: 'Customer PO scan', mimeType: 'application/pdf', fileSize: 412 * 1024, createdAt: ist(9, 0, 1) }];
  fixture.shift = { id: 's1', name: 'Shift 1', startMinute: 360, endMinute: 900, durationMinutes: 540, dateKey: '2026-09-07', timeZone: IST };
  fixture.bom = {
    id: 'b1', status: 'APPROVED',
    stages: [{ id: 's1', materials: [
      { id: 'm1', description: 'FBB board 300 gsm', quantity: 1240, unit: 'Kg', ratePerUnit: 159.35 },
      { id: 'm2', description: 'Process ink · CMYK', quantity: 24.8, unit: 'Kg', ratePerUnit: 1680 },
    ] }],
  };
  fixture.summary = {
    processName: 'Printing', canSign: true, unit: 'Nos', handedOver: { processName: 'Line clearance', output: 40000 },
    blockers: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  seedD4();
});

describe('the D4 view', () => {
  it('reads D4\'s picture: signed, running, blocked-by, not-yet — with the running phase\'s figures as a PAIR', async () => {
    as('OWNER');
    const v = (await getOrderDesktopView('o1', NOW))!;
    expect(v.orderNumber).toBe('ORD-2026-118');
    expect(v.phases.map((p) => p.state.kind)).toEqual(['SIGNED', 'RUNNING', 'BLOCKED', 'NOT_YET']);
    expect(v.phases[2].state).toEqual({ kind: 'BLOCKED', bySequence: 2 });
    expect(v.phases[1].figures).toEqual({ produced: 40850, waste: 18.5, handedOver: 40000, unit: 'Nos' });
    expect(v.progress).toEqual({ done: 1, total: 4 });
    expect(v.position).toEqual({ at: 2, of: 4, name: 'Printing' });
  });

  it('composes the phase detail from what is recorded: machine · in-charge · operators', async () => {
    as('OWNER');
    const v = (await getOrderDesktopView('o1', NOW))!;
    expect(v.phases[1].detail).toBe('Heidelberg SM 74 · Ramesh Kumar · 4 operators');
    expect(v.phases[2].detail).toBe(''); // nothing recorded → nothing invented
  });

  it('formats every time in the FACTORY zone (D22): 06:40 IST is 01:10 UTC and must read 06:40', async () => {
    as('OWNER');
    const v = (await getOrderDesktopView('o1', NOW))!;
    expect(v.phases[0].signedAtLabel).toBe('06:12');
    expect(v.phases[1].startedAtLabel).toBe('06:40');
    expect(v.phases[1].plannedEndLabel).toBe('14:00');
    expect(v.deliveryLabel).toBe('18/09/2026');
    expect(v.daysLeft).toBe(11);
  });

  it('builds the hourly strip from the shift and the checks: taken, failed, still to come', async () => {
    as('OWNER');
    const q = (await getOrderDesktopView('o1', NOW))!.quality;
    expect(q.strip.map((s) => s.state)).toEqual(['PASS', 'MISSED', 'MISSED', 'FAIL', 'UPCOMING', 'UPCOMING', 'UPCOMING', 'UPCOMING', 'UPCOMING']);
    expect(q).toMatchObject({ taken: 2, passed: 1, openDefect: { parameter: 'Shade', defectType: 'major' } });
  });

  it('with no shift configured the strip is empty rather than invented', async () => {
    as('OWNER');
    fixture.shift = null;
    expect((await getOrderDesktopView('o1', NOW))!.quality.strip).toEqual([]);
  });

  it('documents carry name and a compact meta line', async () => {
    as('OWNER');
    const [doc] = (await getOrderDesktopView('o1', NOW))!.documents;
    expect(doc).toEqual({ id: 'd1', name: 'Customer PO scan', meta: 'PDF · 412 KB · 01/09' });
  });

  it('an order that does not exist answers null — the page 404s, nothing else is fetched', async () => {
    as('OWNER');
    fixture.order = null;
    expect(await getOrderDesktopView('nope', NOW)).toBeNull();
    expect(calls).toEqual(['getOrder']);
  });

  it('an order with no phase plan yields no phases and no position, not an error (D10)', async () => {
    as('OWNER');
    fixture.phases = [];
    const v = (await getOrderDesktopView('o1', NOW))!;
    expect(v.phases).toEqual([]);
    expect(v.position).toBeNull();
    expect(v.signOff).toBeNull();
    expect(calls).not.toContain('getSignOffSummary'); // nothing running, nothing to summarise
  });

  it('only the ACTIVE phase is summarised — one sign-off call, not one per phase', async () => {
    as('OWNER');
    await getOrderDesktopView('o1', NOW);
    expect(calls.filter((c) => c === 'getSignOffSummary')).toHaveLength(1);
  });
});

describe('the blocker lives INSIDE the running phase', () => {
  beforeEach(() => {
    fixture.summary = {
      processName: 'Printing', canSign: false, unit: 'Nos', handedOver: null,
      blockers: [{ kind: 'QC_FAILURE', checkId: 'c1', parameterName: 'Shade', checkTime: ist(9, 0) }],
    };
  });

  it('is on the running phase and on no other', async () => {
    as('OWNER');
    const v = (await getOrderDesktopView('o1', NOW))!;
    expect(v.phases[1].blockers).toEqual([{ kind: 'QC_FAILURE', parameter: 'Shade', timeLabel: '09:00' }]);
    for (const i of [0, 2, 3]) expect(v.phases[i].blockers).toEqual([]);
  });

  it('maps every blocker kind to a view a screen can draw', async () => {
    as('OWNER');
    fixture.summary!.blockers = [
      { kind: 'NO_PRODUCTION' },
      { kind: 'WASTE_REASON', logId: 'l1', loggedAt: ist(8, 15), qtyWaste: 12 },
    ];
    const v = (await getOrderDesktopView('o1', NOW))!;
    expect(v.phases[1].blockers).toEqual([{ kind: 'NO_PRODUCTION' }, { kind: 'WASTE_REASON', qtyWaste: 12, timeLabel: '08:15' }]);
  });
});

describe('the sign-off action — present-and-explaining, or absent; never disabled', () => {
  it('present when the person can sign', async () => {
    as('SUPERVISOR');
    expect((await getOrderDesktopView('o1', NOW))!.signOff).toEqual({ phaseId: 'p2', name: 'Printing', blockedReasons: 0 });
  });

  it.each(['OWNER', 'ADMIN', 'SUPERVISOR'] as MisRoleName[])(
    '%s (holds phase.write) KEEPS the action while a blocker is open, with the reason count — it explains rather than silently failing',
    async (role) => {
      as(role);
      fixture.summary = { ...fixture.summary!, canSign: false, blockers: [{ kind: 'NO_PRODUCTION' }, { kind: 'NO_PRODUCTION' }] };
      expect((await getOrderDesktopView('o1', NOW))!.signOff).toEqual({ phaseId: 'p2', name: 'Printing', blockedReasons: 2 });
    },
  );

  it('QC (no phase.write) does not get it while blocked — absent, not greyed', async () => {
    as('QC');
    fixture.summary = { ...fixture.summary!, canSign: false, blockers: [{ kind: 'NO_PRODUCTION' }] };
    expect((await getOrderDesktopView('o1', NOW))!.signOff).toBeNull();
  });

  it('nobody gets it when nothing blocks and they cannot sign (not the in-charge)', async () => {
    as('SUPERVISOR');
    fixture.summary = { ...fixture.summary!, canSign: false, blockers: [] };
    expect((await getOrderDesktopView('o1', NOW))!.signOff).toBeNull();
  });
});

describe('NO MONEY — D4, asserted on the payload for every role that can open the screen', () => {
  // The fixture's BOM carries rates (159.35 and 1680), as the Owner's getBom really does.
  const MONEY_WORDS = /rate|price|cost|wage|salary|amount|rupee|₹|\bINR\b/i;

  it.each(READERS)('%s: the view holds no rate, no rupee and no money-shaped key or value', async (role) => {
    as(role);
    const v = (await getOrderDesktopView('o1', NOW))!;
    const text = JSON.stringify(v);
    expect(text).not.toMatch(MONEY_WORDS);
    expect(text).not.toContain('159.35');
    expect(text).not.toContain('1680');
    expect(text).not.toContain('ratePerUnit');
  });

  it('...while the quantities it DOES show are all there (so the absence above is not an empty BOM)', async () => {
    as('OWNER');
    const bom = (await getOrderDesktopView('o1', NOW))!.bom!;
    expect(bom.items).toEqual([
      { id: 'm1', description: 'FBB board 300 gsm', quantity: '1,240', unit: 'Kg' },
      { id: 'm2', description: 'Process ink · CMYK', quantity: '24.8', unit: 'Kg' },
    ]);
  });

  it('every key of the BOM items is one of exactly four — a new field would fail here first', async () => {
    as('OWNER');
    const bom = (await getOrderDesktopView('o1', NOW))!.bom!;
    for (const item of bom.items) expect(Object.keys(item).sort()).toEqual(['description', 'id', 'quantity', 'unit']);
  });
});

describe('the page cannot throw for a role it lets in', () => {
  // The tests above mock every function underneath, so they cannot notice this: getOrderDesktopView
  // calls functions gated on OTHER permissions. If a role could open the screen (orders.read) but
  // lacked one of those, the real page would throw for them. This asserts the invariant on the
  // real matrix.
  it('every role that holds orders.read also holds production.read, qc.read and phase.read', async () => {
    const { can } = await import('@/lib/mis/permissions');
    const openers = MIS_ROLES.filter((r) => can(r, 'orders.read'));
    expect(openers.sort()).toEqual([...READERS].sort()); // the four this file treats as readers
    for (const role of openers) {
      for (const action of ['production.read', 'qc.read', 'phase.read'] as const) {
        expect(can(role, action), `${role} may open the order but lacks ${action}`).toBe(true);
      }
    }
  });
});

describe('who may call it — all eight roles, at the function', () => {
  it.each(READERS)('%s is served', async (role) => {
    as(role);
    expect(await getOrderDesktopView('o1', NOW)).not.toBeNull();
  });

  it.each(REFUSED)('%s is refused, and NOTHING underneath is called', async (role) => {
    as(role);
    await expect(getOrderDesktopView('o1', NOW)).rejects.toThrow(/Not permitted: orders\.read/);
    expect(calls).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(getOrderDesktopView('o1', NOW)).rejects.toThrow(/Not permitted/);
    expect(calls).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import { buildMachineUtilisation, type AllocationLike, type MachineLike } from './machine-utilisation';

const machine = (over: Partial<MachineLike> = {}): MachineLike => ({ id: 'm1', code: 'MC-01', name: 'Heidelberg SM 74', isActive: true, ...over });
const alloc = (over: Partial<AllocationLike> = {}): AllocationLike => ({ machineId: 'm1', startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T06:00:00Z'), releasedAt: null, ...over });
const range = (fromIso: string, toIso: string) => ({ from: new Date(fromIso), to: new Date(toIso) });

describe('buildMachineUtilisation — the basic percentage', () => {
  it('a machine booked for exactly half the range reads 50%', () => {
    const r = buildMachineUtilisation({
      machines: [machine()],
      allocations: [alloc({ startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T12:00:00Z') })],
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'), // 24h window
    });
    expect(r.rows[0]).toMatchObject({ machineId: 'm1', percent: 50, bookedMinutes: 720, allocationCount: 1 });
  });

  it('a machine with no allocations at all reads 0%, and still appears in the rows', () => {
    const r = buildMachineUtilisation({ machines: [machine({ id: 'm2', code: 'MC-02', name: 'Idle One' })], allocations: [], range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z') });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ percent: 0, bookedMinutes: 0, allocationCount: 0 });
  });

  it('several allocations on the same machine sum together', () => {
    const r = buildMachineUtilisation({
      machines: [machine()],
      allocations: [
        alloc({ startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T02:00:00Z') }),
        alloc({ startsAt: new Date('2026-09-01T04:00:00Z'), endsAt: new Date('2026-09-01T06:00:00Z') }),
      ],
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.rows[0]).toMatchObject({ bookedMinutes: 240, allocationCount: 2 });
  });
});

describe('clipping to the range', () => {
  it('an allocation starting before the range only counts the part inside it', () => {
    const r = buildMachineUtilisation({
      machines: [machine()],
      allocations: [alloc({ startsAt: new Date('2026-08-31T18:00:00Z'), endsAt: new Date('2026-09-01T06:00:00Z') })], // 6h before, 6h inside
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.rows[0].bookedMinutes).toBe(360); // only the 6h inside the range
  });

  it('an allocation ending after the range only counts the part inside it', () => {
    const r = buildMachineUtilisation({
      machines: [machine()],
      allocations: [alloc({ startsAt: new Date('2026-09-01T18:00:00Z'), endsAt: new Date('2026-09-02T06:00:00Z') })], // 6h inside, 6h after
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.rows[0].bookedMinutes).toBe(360);
  });

  it('an allocation entirely outside the range contributes nothing', () => {
    const r = buildMachineUtilisation({
      machines: [machine()],
      allocations: [alloc({ startsAt: new Date('2026-09-05T00:00:00Z'), endsAt: new Date('2026-09-05T06:00:00Z') })],
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.rows[0]).toMatchObject({ bookedMinutes: 0, allocationCount: 0 });
  });

  it('percent is capped at 100 even if bookings somehow overlap past the available time', () => {
    const r = buildMachineUtilisation({
      machines: [machine()],
      allocations: [
        alloc({ startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-02T00:00:00Z') }),
        alloc({ startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-02T00:00:00Z') }), // a duplicate/overlapping row
      ],
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.rows[0].percent).toBe(100);
  });
});

describe('a release ends the booking early', () => {
  it('releasedAt before endsAt shortens the counted window', () => {
    const r = buildMachineUtilisation({
      machines: [machine()],
      allocations: [alloc({ startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T12:00:00Z'), releasedAt: new Date('2026-09-01T06:00:00Z') })],
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.rows[0].bookedMinutes).toBe(360); // 6h, not the planned 12h
  });

  it('a releasedAt LATER than endsAt never extends the window past the plan', () => {
    const r = buildMachineUtilisation({
      machines: [machine()],
      allocations: [alloc({ startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T06:00:00Z'), releasedAt: new Date('2026-09-01T12:00:00Z') })],
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.rows[0].bookedMinutes).toBe(360); // the planned 6h, not past it
  });
});

describe('isActive is the machine\'s CURRENT flag, not a claim about the whole range (F-14)', () => {
  it('a currently-inactive machine with real bookings in the range still shows its real percent', () => {
    const r = buildMachineUtilisation({
      machines: [machine({ isActive: false })],
      allocations: [alloc({ startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T12:00:00Z') })],
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.rows[0]).toMatchObject({ isActive: false, percent: 50 });
  });
});

describe('sorting and totals', () => {
  it('rows sort by percent descending, most booked first', () => {
    const r = buildMachineUtilisation({
      machines: [machine({ id: 'low', code: 'L', name: 'Low' }), machine({ id: 'high', code: 'H', name: 'High' })],
      allocations: [
        alloc({ machineId: 'low', startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T01:00:00Z') }),
        alloc({ machineId: 'high', startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T20:00:00Z') }),
      ],
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.rows.map((row) => row.machineId)).toEqual(['high', 'low']);
  });

  it('totals sum every row, including machines never booked', () => {
    const r = buildMachineUtilisation({
      machines: [machine({ id: 'a' }), machine({ id: 'b', code: 'B', name: 'Idle' })],
      allocations: [alloc({ machineId: 'a', startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T06:00:00Z') })],
      range: range('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
    });
    expect(r.totals).toMatchObject({ bookedMinutes: 360, allocationCount: 1, machineCount: 2 });
  });

  it('availableMinutes is the plain wall-clock span of the range', () => {
    const r = buildMachineUtilisation({ machines: [], allocations: [], range: range('2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z') }); // 7 days
    expect(r.availableMinutes).toBe(7 * 24 * 60);
  });
});

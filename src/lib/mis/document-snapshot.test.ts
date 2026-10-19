/** R2-46 follow-up — pure snapshot rules. */
import { describe, expect, it } from 'vitest';

import {
  coaSnapshotFrom,
  docDataSource,
  jobCardSnapshotFrom,
  parseSnapshot,
  parseVersionParam,
  sameSnapshotContent,
} from './document-snapshot';
import { docFileName } from './document-version';

const order = { orderNumber: 'ORD-1', status: 'COMPLETED', description: 'd', deliveryDate: new Date('2026-10-25T00:00:00Z'), notes: null, customer: { name: 'Acme' } };
const qc = [{ id: 'c1', parameterName: 'Shade', result: 'PASS', defectType: null, notes: null, checkTime: new Date('2026-10-19T04:30:00Z'), checkBy: { name: 'Q' } }];

describe('document snapshot', () => {
  it('a COA snapshot survives a JSON round-trip unchanged (what the DB stores)', () => {
    const snap = coaSnapshotFrom(order, qc, new Date('2026-10-19T06:00:00Z'));
    const stored = JSON.parse(JSON.stringify(snap));
    expect(parseSnapshot(stored, 'COA')).toEqual(snap);
    expect(snap.order.deliveryDate).toBe('2026-10-25T00:00:00.000Z');
  });

  it('a job-card summary with no per-unit rows keeps its single total', () => {
    const snap = jobCardSnapshotFrom({ order, bom: null, production: { totalProduced: 10, totalWaste: 1, entries: 1, byUnit: [] }, phases: [], crew: [] }, new Date());
    expect(snap.production.byUnit).toEqual([{ unit: '', produced: 10, waste: 1 }]);
    expect(snap.bomStages).toEqual([]);
  });

  it('parseSnapshot refuses another type, junk and null', () => {
    const coa = coaSnapshotFrom(order, qc, new Date());
    expect(parseSnapshot(coa, 'JOB_CARD')).toBeNull();
    expect(parseSnapshot(null, 'COA')).toBeNull();
    expect(parseSnapshot({ kind: 'COA', capturedAt: 'x', order: {} }, 'COA')).toBeNull();
    expect(parseSnapshot('COA', 'COA')).toBeNull();
  });

  it('sameSnapshotContent ignores the capture time only', () => {
    const a = coaSnapshotFrom(order, qc, new Date('2026-10-19T00:00:00Z'));
    const b = coaSnapshotFrom(order, qc, new Date('2026-10-20T00:00:00Z'));
    expect(sameSnapshotContent(a, b)).toBe(true);
    expect(sameSnapshotContent(a, coaSnapshotFrom({ ...order, description: 'x' }, qc, new Date()))).toBe(false);
    expect(sameSnapshotContent(a, null)).toBe(false);
  });

  it('only an APPROVED version with a snapshot prints frozen', () => {
    expect(docDataSource(null)).toBe('LIVE');
    expect(docDataSource({ status: 'PREPARED', hasSnapshot: true })).toBe('LIVE');
    expect(docDataSource({ status: 'APPROVED', hasSnapshot: true })).toBe('SNAPSHOT');
    expect(docDataSource({ status: 'APPROVED', hasSnapshot: false })).toBe('LIVE_NO_SNAPSHOT');
    expect(docDataSource({ status: 'APPROVED' })).toBe('LIVE_NO_SNAPSHOT');
  });

  it('?v= parses a positive whole number only', () => {
    expect(parseVersionParam('2')).toBe(2);
    expect(parseVersionParam(['3', '4'])).toBe(3);
    for (const bad of [undefined, '', '0', '-1', '1.5', 'abc', '1e3', '9999999']) expect(parseVersionParam(bad)).toBeNull();
  });

  it('the file name carries the version shown: _V1 for the old approved one, _V2 for its update', () => {
    const at = new Date('2026-10-19T04:30:00Z');
    expect(docFileName('COA', 'ORD-1', at, 1, 'Asia/Kolkata')).toBe('COA_ORD-1_191026_V1');
    expect(docFileName('JOB_CARD', 'ORD-1', at, 2, 'Asia/Kolkata')).toBe('JobCard_ORD-1_191026_V2');
  });
});

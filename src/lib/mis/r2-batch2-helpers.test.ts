/** Pure helpers behind R2-17/34 (corrections), R2-40/41 (board sync), R2-46 (doc versions), R2-47 (lock), R2-10 (catalog). */
import { describe, expect, it } from 'vitest';

import { searchCatalog, catalogLabel } from './catalog-search';
import { approvalRefusal, docFileName, nextVersionNumber, versionLabel } from './document-version';
import { correctionVerdict, requireCorrectionReason } from './entry-correction';
import { autoBlockWindow, decideMachineSync } from './machine-sync';
import { makereadyError } from './production-form';
import { mayReleaseWorker, splitByLock, workerLockState } from './worker-lock';

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-10-19T09:00:00Z');
const H = 3_600_000;
const base = { actorId: 'u1', ownerId: 'u1', now: NOW, timeZone: TZ };

describe('correctionVerdict', () => {
  it('Admin/Owner: 7 days, edit and delete, any owner', () => {
    for (const role of ['ADMIN', 'OWNER'] as const) {
      for (const action of ['EDIT', 'DELETE'] as const) {
        expect(correctionVerdict({ ...base, ownerId: 'x', kind: 'PRODUCTION', action, role, at: new Date(NOW.getTime() - 7 * 24 * H) }).allowed).toBe(true);
        expect(correctionVerdict({ ...base, kind: 'QC', action, role, at: new Date(NOW.getTime() - 7 * 24 * H - 1) }).allowed).toBe(false);
      }
    }
  });
  it('QC: own, same factory day only', () => {
    expect(correctionVerdict({ ...base, kind: 'QC', action: 'EDIT', role: 'QC', at: new Date('2026-10-18T18:31:00Z') }).allowed).toBe(true); // 00:01 IST
    expect(correctionVerdict({ ...base, kind: 'QC', action: 'DELETE', role: 'QC', at: new Date('2026-10-18T18:29:00Z') }).allowed).toBe(false); // 23:59 IST yesterday
    expect(correctionVerdict({ ...base, ownerId: 'u2', kind: 'QC', action: 'EDIT', role: 'QC', at: NOW }).allowed).toBe(false);
    expect(correctionVerdict({ ...base, ownerId: null, kind: 'QC', action: 'EDIT', role: 'QC', at: NOW }).allowed).toBe(false);
  });
  it('Supervisor: production edit 24 h; never delete; never QC', () => {
    expect(correctionVerdict({ ...base, kind: 'PRODUCTION', action: 'EDIT', role: 'SUPERVISOR', at: new Date(NOW.getTime() - 24 * H) }).allowed).toBe(true);
    expect(correctionVerdict({ ...base, kind: 'PRODUCTION', action: 'EDIT', role: 'SUPERVISOR', at: new Date(NOW.getTime() - 24 * H - 1) }).allowed).toBe(false);
    expect(correctionVerdict({ ...base, kind: 'PRODUCTION', action: 'DELETE', role: 'SUPERVISOR', at: NOW }).allowed).toBe(false);
    expect(correctionVerdict({ ...base, kind: 'QC', action: 'EDIT', role: 'SUPERVISOR', at: NOW }).allowed).toBe(false);
  });
  it.each(['WORKER', 'STORE_GUY', null] as const)('%s: never', (role) => {
    expect(correctionVerdict({ ...base, kind: 'PRODUCTION', action: 'EDIT', role, at: NOW }).allowed).toBe(false);
  });
  it('a reason is 3+ characters, trimmed', () => {
    expect(requireCorrectionReason('  typo ')).toBe('typo');
    expect(() => requireCorrectionReason('ab')).toThrow(/reason/);
    expect(() => requireCorrectionReason(undefined)).toThrow(/reason/);
  });
});

describe('decideMachineSync / autoBlockWindow', () => {
  const at = new Date('2026-10-19T04:30:00Z');
  const b = (over: Record<string, unknown>) => ({ id: 'a', machineId: 'm', orderId: 'o1', startsAt: new Date(at.getTime() - H), endsAt: new Date(at.getTime() + H), releasedAt: null, ...over });
  it('covered by the same order, conflict with another log, warn on another scheduled booking, else create', () => {
    expect(decideMachineSync({ machineId: 'm', orderId: 'o1', at }, [b({})]).kind).toBe('COVERED');
    expect(decideMachineSync({ machineId: 'm', orderId: 'o2', at }, [b({ source: 'PRODUCTION_LOG' })]).kind).toBe('CONFLICT');
    expect(decideMachineSync({ machineId: 'm', orderId: 'o2', at }, [b({ source: 'SCHEDULED' })]).kind).toBe('SCHEDULED_OTHER');
    expect(decideMachineSync({ machineId: 'm', orderId: 'o2', at }, [b({ source: 'PRODUCTION_LOG', releasedAt: new Date() })]).kind).toBe('CREATE');
    expect(decideMachineSync({ machineId: 'm', orderId: 'o2', at }, [b({ machineId: 'other', source: 'PRODUCTION_LOG' })]).kind).toBe('CREATE');
    expect(decideMachineSync({ machineId: 'm', orderId: 'o1', at }, []).kind).toBe('CREATE');
  });
  it('the block is the shift holding the log, else the hour up to it', () => {
    const shift = { start: new Date(at.getTime() - 4 * H), end: new Date(at.getTime() + 4 * H) };
    expect(autoBlockWindow(at, shift)).toEqual({ startsAt: shift.start, endsAt: shift.end });
    expect(autoBlockWindow(at, null)).toEqual({ startsAt: new Date(at.getTime() - H), endsAt: at });
    expect(autoBlockWindow(at, { start: new Date(at.getTime() + H), end: new Date(at.getTime() + 2 * H) }).endsAt).toEqual(at);
  });
});

describe('makereadyError', () => {
  it('blank is fine; whole minutes 0..1440; anything else is refused', () => {
    expect(makereadyError('')).toBeNull();
    expect(makereadyError('0')).toBeNull();
    expect(makereadyError('1440')).toBeNull();
    for (const bad of ['-1', '1441', '2.5', 'x']) expect(makereadyError(bad)).toMatch(/Makeready/);
  });
});

describe('document versions', () => {
  it('next number, file name, label, approval rule', () => {
    expect(nextVersionNumber([])).toBe(1);
    expect(nextVersionNumber([{ version: 1 }, { version: 3 }])).toBe(4);
    expect(docFileName('COA', 'ORD-101', new Date('2026-10-19T04:30:00Z'), 2, TZ)).toBe('COA_ORD-101_191026_V2');
    expect(docFileName('JOB_CARD', 'ORD 7/A', new Date('2026-10-19T20:00:00Z'), null, TZ)).toBe('JobCard_ORD-7-A_201026_DRAFT');
    expect(versionLabel(null)).toMatch(/uncontrolled/);
    expect(versionLabel({ version: 2, status: 'APPROVED' })).toBe('V2 · Approved');
    expect(approvalRefusal({ role: 'SUPERVISOR', actorId: 'a', preparedById: 'b', status: 'PREPARED' })).toMatch(/Admin or the Owner/);
    expect(approvalRefusal({ role: 'ADMIN', actorId: 'a', preparedById: 'a', status: 'PREPARED' })).toMatch(/second person/);
    expect(approvalRefusal({ role: 'OWNER', actorId: 'a', preparedById: 'b', status: 'APPROVED' })).toMatch(/already/);
    expect(approvalRefusal({ role: 'OWNER', actorId: 'a', preparedById: 'b', status: 'PREPARED' })).toBeNull();
  });
});

describe('worker lock', () => {
  it('state, release right, split', () => {
    expect(workerLockState([])).toBe('AVAILABLE');
    expect(workerLockState([{}])).toBe('BLOCKED');
    expect(mayReleaseWorker({ role: 'SUPERVISOR', actorId: 'a', holderId: 'a' })).toBe(true);
    expect(mayReleaseWorker({ role: 'SUPERVISOR', actorId: 'a', holderId: 'b' })).toBe(false);
    expect(mayReleaseWorker({ role: 'ADMIN', actorId: 'a', holderId: 'b' })).toBe(true);
    expect(mayReleaseWorker({ role: 'SUPERVISOR', actorId: 'a', holderId: null })).toBe(true);
    const { available, blocked } = splitByLock([{ n: 1, allocations: [] }, { n: 2, allocations: [{}] }, { n: 3, allocations: [] }]);
    expect(available.map((r) => r.n)).toEqual([1, 3]);
    expect(blocked.map((r) => r.n)).toEqual([2]);
  });
});

describe('searchCatalog', () => {
  const items = [
    { id: '1', code: 'KR-120', name: 'Kraft Liner 120 GSM', unit: 'KG' },
    { id: '2', code: 'INK-R', name: 'Red ink', unit: 'LITRE' },
    { id: '3', code: 'KR', name: 'Kraft offcut', unit: 'KG' },
  ];
  it('every word must match code or name; blank lists nothing; exact code first', () => {
    expect(searchCatalog(items, '')).toEqual([]);
    expect(searchCatalog(items, 'kraft 120').map((i) => i.id)).toEqual(['1']);
    expect(searchCatalog(items, 'ink').map((i) => i.id)).toEqual(['2']);
    expect(searchCatalog(items, 'kr').map((i) => i.id)).toEqual(['3', '1']);
    expect(searchCatalog(items, 'kraft', 1)).toHaveLength(1);
    expect(catalogLabel(items[0])).toBe('KR-120 · Kraft Liner 120 GSM (KG)');
  });
});

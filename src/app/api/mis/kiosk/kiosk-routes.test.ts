import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every kiosk route sits behind an auth exemption, so every one must refuse an
 * un-tokened caller on its own (D18). These call the real route handlers with
 * requests a hostile or confused client might send, and assert two things: the
 * answer is a refusal, and NO MIS data was read on the way to it.
 */

const employeeReads = vi.fn();
const deviceReads = vi.fn();
const deviceWrites = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    misKioskDevice: {
      findUnique: (...a: unknown[]) => (deviceReads(...a), Promise.resolve(null)),
      findFirst: (...a: unknown[]) => (deviceReads(...a), Promise.resolve(null)),
      findMany: (...a: unknown[]) => (deviceReads(...a), Promise.resolve([])),
      update: (...a: unknown[]) => (deviceWrites(...a), Promise.resolve({})),
      updateMany: (...a: unknown[]) => (deviceWrites(...a), Promise.resolve({ count: 0 })),
      create: (...a: unknown[]) => (deviceWrites(...a), Promise.resolve({ id: 'x' })),
      deleteMany: (...a: unknown[]) => (deviceWrites(...a), Promise.resolve({ count: 0 })),
      count: () => Promise.resolve(0),
    },
    misEmployee: { findMany: (...a: unknown[]) => (employeeReads(...a), Promise.resolve([])) },
    misShift: { findMany: (...a: unknown[]) => (employeeReads(...a), Promise.resolve([])) },
    misWorkerAllocation: { findMany: (...a: unknown[]) => (employeeReads(...a), Promise.resolve([])) },
    misAttendance: { findMany: (...a: unknown[]) => (employeeReads(...a), Promise.resolve([])) },
  },
}));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => null }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => null }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const enrol = await import('./enrol/route');
const claim = await import('./enrol/claim/route');
const pull = await import('./pull/route');
const punch = await import('./punch/route');

const post = (path: string, init: { headers?: Record<string, string>; body?: unknown } = {}) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

beforeEach(() => vi.clearAllMocks());

describe('POST /api/mis/kiosk/pull refuses an un-tokened caller', () => {
  it.each([
    ['no Authorization header', {}],
    ['an empty header', { authorization: '' }],
    ['Basic auth', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['a bare token with no scheme', { authorization: `mkd_${'A'.repeat(43)}` }],
    ['a malformed token', { authorization: 'Bearer nope' }],
    ['a well-formed token nobody holds', { authorization: `Bearer mkd_${'B'.repeat(43)}` }],
    ['a portal session cookie instead of a token', { cookie: 'sb-access-token=abc' }],
  ])('%s → 401 and no employee data read', async (_label, headers) => {
    const res = await pull.POST(post('/api/mis/kiosk/pull', { headers: headers as Record<string, string>, body: {} }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHORIZED', message: 'Not authorised.' });
    expect(employeeReads).not.toHaveBeenCalled();
    expect(deviceWrites).not.toHaveBeenCalled();
  });

  it('never reads even the device table for a malformed credential', async () => {
    await pull.POST(post('/api/mis/kiosk/pull', { headers: { authorization: 'Bearer nope' }, body: {} }));
    expect(deviceReads).not.toHaveBeenCalled();
  });

  it('has no GET — a tablet cannot pull with a bare navigation', () => {
    expect((pull as Record<string, unknown>).GET).toBeUndefined();
  });

  it('sends no-store, so a proxy never caches a roll or a refusal', async () => {
    const res = await pull.POST(post('/api/mis/kiosk/pull', { body: {} }));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('POST /api/mis/kiosk/enrol/claim refuses a caller without the poll secret', () => {
  it.each([
    ['an empty body', undefined],
    ['an empty object', {}],
    ['a non-uuid device id', { deviceId: 'abc', pollSecret: `mks_${'A'.repeat(43)}` }],
    ['a missing secret', { deviceId: '00000000-0000-4000-8000-000000000001' }],
    ['a malformed secret', { deviceId: '00000000-0000-4000-8000-000000000001', pollSecret: 'hunter2' }],
    ['a token where the secret goes', { deviceId: '00000000-0000-4000-8000-000000000001', pollSecret: `mkd_${'A'.repeat(43)}` }],
    ['an unknown device with a well-formed secret', { deviceId: '00000000-0000-4000-8000-000000000001', pollSecret: `mks_${'A'.repeat(43)}` }],
  ])('%s → 401, generic, nothing written', async (_label, body) => {
    const res = await claim.POST(post('/api/mis/kiosk/enrol/claim', { body }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHORIZED', message: 'Not authorised.' });
    expect(employeeReads).not.toHaveBeenCalled();
    expect(deviceWrites).not.toHaveBeenCalled();
  });

  it('ignores an oversized body rather than parsing it', async () => {
    const res = await claim.POST(post('/api/mis/kiosk/enrol/claim', { body: { deviceId: 'x'.repeat(50_000) } }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/mis/kiosk/enrol — the one door with no credential to check', () => {
  it('reads no MIS data and returns only the tablet’s own new code and secret', async () => {
    const res = await enrol.POST(post('/api/mis/kiosk/enrol', { body: { hardwareLabel: 'Samsung Tab A9' } }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(['code', 'deviceId', 'expiresAt', 'pollSecret']);
    expect(employeeReads).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('survives a garbage body', async () => {
    const res = await enrol.POST(new Request('http://localhost/api/mis/kiosk/enrol', { method: 'POST', body: '{{{not json' }));
    expect(res.status).toBe(201);
  });
});

describe('an unexpected failure says nothing about itself', () => {
  it('returns a bare 500 with no message, never a query or a table name', async () => {
    deviceReads.mockImplementationOnce(() => {
      throw new Error('relation "mis_kiosk_devices" does not exist — SELECT * FROM secret');
    });
    const res = await pull.POST(post('/api/mis/kiosk/pull', { headers: { authorization: `Bearer mkd_${'C'.repeat(43)}` }, body: {} }));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).toBe('{"error":"SERVER_ERROR"}');
  });
});

describe('POST /api/mis/kiosk/punch refuses an un-tokened caller', () => {
  const body = {
    key: '00000000-0000-4000-8000-0000000000aa',
    kind: 'attendance.punch_in',
    payload: { badgeCode: 'BPP-0142' },
    clientRecordedAt: '2026-09-21T00:34:00.000Z',
  };

  it.each([
    ['no Authorization header', {}],
    ['an empty header', { authorization: '' }],
    ['Basic auth', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['a bare token with no scheme', { authorization: `mkd_${'A'.repeat(43)}` }],
    ['a malformed token', { authorization: 'Bearer nope' }],
    ['a well-formed token nobody holds', { authorization: `Bearer mkd_${'B'.repeat(43)}` }],
    ['the enrolment poll secret used as a token', { authorization: `Bearer mks_${'C'.repeat(43)}` }],
    ['a portal session cookie instead of a token', { cookie: 'sb-access-token=abc' }],
  ])('%s → 401, and no employee or punch data read or written', async (_label, headers) => {
    const res = await punch.POST(post('/api/mis/kiosk/punch', { headers: headers as Record<string, string>, body }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHORIZED', message: 'Not authorised.' });
    expect(employeeReads).not.toHaveBeenCalled();
    expect(deviceWrites).not.toHaveBeenCalled();
  });

  it('never reads even the device table for a malformed credential', async () => {
    await punch.POST(post('/api/mis/kiosk/punch', { headers: { authorization: 'Bearer nope' }, body }));
    expect(deviceReads).not.toHaveBeenCalled();
  });

  it('refuses before looking at the body — a hostile body cannot change the answer', async () => {
    const res = await punch.POST(post('/api/mis/kiosk/punch', { body: { key: 'x'.repeat(50_000) } }));
    expect(res.status).toBe(401);
  });

  it('has no GET, and never caches', async () => {
    expect((punch as Record<string, unknown>).GET).toBeUndefined();
    const res = await punch.POST(post('/api/mis/kiosk/punch', { body }));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

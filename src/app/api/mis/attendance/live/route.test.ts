/**
 * The kiosk screen's live-poll route: thin, calls the same `listAttendanceLive`
 * the screen's initial-load path is built on, and — this is the point of this
 * file — never lets a refusal or a DB hiccup escape as a raw platform crash.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listAttendanceLive = vi.fn();
vi.mock('@/server/mis/attendance', () => ({ listAttendanceLive: (...a: unknown[]) => listAttendanceLive(...a) }));

const { GET } = await import('./route');
const call = (qs = '') => GET(new Request(`http://x/api/mis/attendance/live${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  listAttendanceLive.mockResolvedValue([
    { employeeId: 'e1', clockIn: new Date('2026-09-28T06:00:00Z'), clockOut: null, status: 'PRESENT' },
  ]);
});

describe('GET /api/mis/attendance/live', () => {
  it("returns the day's register, no-store", async () => {
    const res = await call('?date=2026-09-28');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body.attendance).toHaveLength(1);
    expect(body.attendance[0]).toMatchObject({ employeeId: 'e1', status: 'PRESENT' });
  });

  it('passes the date query param straight through to the same function the page uses', async () => {
    await call('?date=2026-09-14');
    expect(listAttendanceLive).toHaveBeenCalledWith('2026-09-14');
  });

  it('no date param falls back to today inside the server function', async () => {
    await call();
    expect(listAttendanceLive).toHaveBeenCalledWith(undefined);
  });

  it('a refused caller gets 403 and no data', async () => {
    listAttendanceLive.mockRejectedValue(Object.assign(new Error('nope'), { name: 'MisForbiddenError' }));
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('any other failure is a 500 that does not echo the error text', async () => {
    listAttendanceLive.mockRejectedValue(new Error('connection string postgres://secret'));
    const res = await call();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('postgres');
  });
});

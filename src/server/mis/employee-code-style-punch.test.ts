import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPLOYEE_CODE_STYLES, generateEmployeeCode } from '@/lib/mis/employee-code-style';
import { newIdempotencyKey } from '@/lib/mis/offline/idempotency';

import { createFakeDb } from './offline-fake-db';

/** Kiosk punch lookup under each employee-code style (stored codes never rewritten). */
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: vi.fn() }));
const fake = createFakeDb();
vi.mock('@/server/db', () => ({ db: fake.db }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/kiosk-device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./kiosk-device')>();
  return { ...actual, authenticateDevice: vi.fn().mockResolvedValue({ id: 'd', name: 'GATE', revoked: false }), recordDeviceSync: vi.fn() };
});

const { ingestDevicePunch } = await import('./attendance-punch');
const NOW = new Date(Date.UTC(2026, 8, 21, 2, 11));

const punch = (badgeCode: string) =>
  ingestDevicePunch('Bearer mkd_x', {
    key: newIdempotencyKey(),
    kind: 'attendance.punch_in',
    payload: { badgeCode },
    clientRecordedAt: new Date(NOW.getTime() - 60_000).toISOString(),
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  fake.state.punches = [];
  fake.state.attendance = [];
  fake.state.shifts = [{ id: '51111111-1111-4111-8111-111111111111', name: 'Shift 1', startTime: '06:00', endTime: '14:00', isActive: true }];
  fake.state.rules['factory.timezone'] = 'Asia/Kolkata';
  fake.state.rules['ATTENDANCE_CORRECTION_DAYS'] = '3';
});

describe.each(EMPLOYEE_CODE_STYLES)('style %s', (style) => {
  beforeEach(() => {
    fake.state.rules['employee.code_style'] = style;
    fake.state.employees = [
      { id: 'new', employeeCode: generateEmployeeCode(style, 5), name: 'New Person', isActive: true, deletedAt: null },
      { id: 'old', employeeCode: 'EMP001', name: 'Old Person', isActive: true, deletedAt: null },
    ];
  });

  it('applies a punch for the generated code, lower-case with whitespace noise', async () => {
    const code = generateEmployeeCode(style, 5);
    expect(await punch(`  ${code.toLowerCase()} `)).toMatchObject({ outcome: 'APPLIED' });
    expect(fake.state.punches[0].employeeId).toBe('new');
  });

  it('still finds the legacy EMP001 employee (exact, and loosely typed)', async () => {
    expect(await punch('EMP001')).toMatchObject({ outcome: 'APPLIED' });
    expect(fake.state.punches[0].employeeId).toBe('old');
    fake.state.punches = [];
    expect(await punch('emp-1')).toMatchObject({ outcome: 'APPLIED' });
  });

  it('an unknown code is still BADGE_UNKNOWN', async () => {
    const out = await punch('ZZZZZZ');
    expect(out).not.toMatchObject({ outcome: 'APPLIED' });
  });
});

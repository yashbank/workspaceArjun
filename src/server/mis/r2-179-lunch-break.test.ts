import { beforeEach, describe, expect, it, vi } from 'vitest';
import { netWorkedMinutes, punchMinutesNet, unpaidBreakMinutes } from '@/lib/mis/break-minutes';

const requirePermission = vi.fn();
const create = vi.fn();
vi.mock('@/server/mis/auth', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/db', () => ({
  db: { misBusinessRule: { findFirst: vi.fn(async () => ({ ruleKey: 'ATTENDANCE_LUNCH_BREAK_MINUTES', ruleValue: '30', valueType: 'number', label: 'L', description: null, effectiveFrom: new Date() })), create },
  },
}));

const at = (hhmm: string) => new Date(`2026-10-13T${hhmm}:00+05:30`);
const shift = { startTime: '09:00', endTime: '17:00' } as never;

describe('R2-179 lunch setting gate', () => {
  beforeEach(() => { requirePermission.mockReset(); create.mockReset(); });
  it('refuses a non-owner', async () => {
    requirePermission.mockImplementation(async (a: string) => {
      if (a === 'wages.read') throw new Error('Forbidden');
      return { userId: 'u', role: 'ADMIN' };
    });
    const { updateBusinessRule } = await import('./business-rules');
    await expect(updateBusinessRule('ATTENDANCE_LUNCH_BREAK_MINUTES', '45')).rejects.toThrow('Forbidden');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('R2-179 paid lunch maths', () => {
  it('a break within the allowance is fully paid', () => {
    expect(unpaidBreakMinutes(at('13:00'), at('13:30'), 30)).toBe(0);
    const d = { clockIn: at('09:00'), clockOut: at('17:00'), breakOut: at('13:00'), breakIn: at('13:30') };
    expect(netWorkedMinutes(d, 30)).toBe(480);
  });
  it('minutes beyond the allowance are deducted', () => {
    expect(unpaidBreakMinutes(at('13:00'), at('13:50'), 30)).toBe(20);
    const d = { clockIn: at('09:00'), clockOut: at('17:00'), breakOut: at('13:00'), breakIn: at('13:50') };
    expect(netWorkedMinutes(d, 30)).toBe(460);
  });
  it('an open break deducts nothing and never touches the punches', () => {
    const d = { clockIn: at('09:00'), clockOut: at('17:00'), breakOut: at('13:00'), breakIn: null };
    expect(netWorkedMinutes(d, 30)).toBe(480);
    expect(d.clockIn).toEqual(at('09:00'));
  });
  it('OT: paid break leaves OT unchanged, excess lunch reduces it', () => {
    const base = { workDate: '2026-10-13', clockIn: at('09:00'), clockOut: at('18:00') };
    expect(punchMinutesNet({ ...base, breakOut: at('13:00'), breakIn: at('13:30') }, shift, 'Asia/Kolkata', 30).otMinutes).toBe(60);
    expect(punchMinutesNet({ ...base, breakOut: at('13:00'), breakIn: at('13:50') }, shift, 'Asia/Kolkata', 30).otMinutes).toBe(40);
  });
});

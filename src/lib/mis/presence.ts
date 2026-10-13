/**
 * Whether a person is on the floor, from the attendance row and any approved leave (R3 B89).
 *
 * One definition for the crew board, the picker, the crew summary and the nav badge, so they can
 * never disagree about who is "available". Pure: no Prisma, no React.
 *
 * - IN      clocked in and not clocked out.
 * - OUT     clocked out (they were here, they are not now: never "available-green").
 * - LEAVE   an approved leave that day (or a register row marked LEAVE) and not physically clocked in.
 * - ABSENT  the register says ABSENT.
 * - NOT_IN  nothing recorded yet.
 */
export type Presence = 'IN' | 'OUT' | 'LEAVE' | 'ABSENT' | 'NOT_IN';

export type PresenceInput = {
  attendance: { clockIn: Date | null; clockOut: Date | null; status: string } | null;
  onApprovedLeave: boolean;
};

export function presenceOf({ attendance, onApprovedLeave }: PresenceInput): Presence {
  if (attendance?.clockIn) return attendance.clockOut ? 'OUT' : 'IN';
  if (onApprovedLeave || attendance?.status === 'LEAVE') return 'LEAVE';
  if (attendance?.status === 'ABSENT') return 'ABSENT';
  return 'NOT_IN';
}

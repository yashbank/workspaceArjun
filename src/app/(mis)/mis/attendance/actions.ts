'use server';
import {
  clockIn,
  clockOut,
  approveClockOut,
  editAttendance,
  requestLeave,
  approveLeave,
  saveShift,
  setShiftActive,
  markAbsentBulk,
  listPunchesForDay,
  waiveLateness,
  bulkPunch,
  punchBreak,
  deleteShift,
  cancelLeaveRequest,
} from '@/server/mis/attendance';
import { addAttendanceNote } from '@/server/mis/attendance-month';
import { asResult } from '@/lib/mis/action-result';
import { revalidatePath } from 'next/cache';

// R3 B63: every export returns an ActionResult, so a refusal reaches the screen as text, not the error boundary.

export async function clockInAction(employeeId: string, shiftId?: string) {
  return asResult(async () => {
    await clockIn(employeeId, shiftId);
    revalidatePath('/mis/attendance');
  });
}
export async function clockOutAction(attendanceId: string) {
  return asResult(async () => {
    await clockOut(attendanceId);
    revalidatePath('/mis/attendance');
  });
}
export async function approveClockOutAction(attendanceId: string) {
  return asResult(async () => {
    await approveClockOut(attendanceId);
    revalidatePath('/mis/attendance');
  });
}
export async function editAttendanceAction(
  attendanceId: string,
  data: { status?: string; notes?: string; clockInTime?: string | null; clockOutTime?: string | null },
  override?: { reason: string },
) {
  return asResult(async () => {
    await editAttendance(attendanceId, data, override);
    revalidatePath('/mis/attendance');
  });
}
export async function addAttendanceNoteAction(attendanceId: string, note: string) {
  return asResult(async () => {
    await addAttendanceNote(attendanceId, note);
    revalidatePath('/mis/attendance');
  });
}
export async function requestLeaveAction(employeeId: string, date: string, reason?: string, opts?: { endDate?: string | null; leaveType?: string }) {
  return asResult(async () => {
    await requestLeave(employeeId, date, reason, opts);
    revalidatePath('/mis/attendance');
    revalidatePath('/mis/attendance/leave');
  });
}
export async function approveLeaveAction(leaveId: string, approve: boolean) {
  return asResult(async () => {
    const rec = await approveLeave(leaveId, approve);
    revalidatePath('/mis/attendance');
    revalidatePath('/mis/attendance/leave');
    return { skippedDates: rec.skippedDates };
  });
}
export async function saveShiftAction(id: string | null, data: { name: string; startTime: string; endTime: string; isDefault?: boolean }) {
  return asResult(async () => {
    await saveShift(id, data);
    revalidatePath('/mis/attendance');
    revalidatePath('/mis/attendance/shifts');
  });
}
export async function setShiftActiveAction(id: string, isActive: boolean) {
  return asResult(async () => {
    await setShiftActive(id, isActive);
    revalidatePath('/mis/attendance');
    revalidatePath('/mis/attendance/shifts');
  });
}
export async function markAbsentBulkAction(employeeIds: string[], date?: string) {
  return asResult(async () => {
    const out = await markAbsentBulk(employeeIds, date);
    revalidatePath('/mis/attendance');
    return { skipped: out.skipped };
  });
}
export async function listPunchesForDayAction(employeeId: string, date: string) {
  return asResult(async () => listPunchesForDay(employeeId, date));
}
export async function waiveLatenessAction(reason: string, date?: string) {
  return asResult(async () => {
    const out = await waiveLateness(reason, date);
    revalidatePath('/mis/attendance');
    revalidatePath('/mis');
    return { count: out.count };
  });
}
export async function bulkPunchAction(kind: 'IN' | 'OUT', employeeIds: string[], opts?: { date?: string; time?: string | null; shiftId?: string | null }) {
  return asResult(async () => {
    const out = await bulkPunch(kind, employeeIds, opts);
    revalidatePath('/mis/attendance');
    return { skipped: out.skipped };
  });
}
export async function punchBreakAction(kind: 'OUT' | 'IN', employeeIds: string[]) {
  return asResult(async () => {
    const out = await punchBreak(kind, employeeIds);
    revalidatePath('/mis/attendance');
    return { skipped: out.skipped };
  });
}
export async function deleteShiftAction(id: string) {
  return asResult(async () => {
    await deleteShift(id);
    revalidatePath('/mis/attendance');
    revalidatePath('/mis/attendance/shifts');
  });
}
export async function cancelLeaveRequestAction(leaveId: string, reason?: string) {
  return asResult(async () => {
    await cancelLeaveRequest(leaveId, reason);
    revalidatePath('/mis/attendance');
    revalidatePath('/mis/attendance/leave');
    revalidatePath('/mis/approvals');
  });
}

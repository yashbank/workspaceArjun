'use server';
import { clockIn, clockOut, approveClockOut, editAttendance, requestLeave, approveLeave, saveShift, markAbsentBulk } from '@/server/mis/attendance';
import { revalidatePath } from 'next/cache';

export async function clockInAction(employeeId: string, shiftId?: string) {
  await clockIn(employeeId, shiftId);
  revalidatePath('/mis/attendance');
}
export async function clockOutAction(attendanceId: string) {
  await clockOut(attendanceId);
  revalidatePath('/mis/attendance');
}
export async function approveClockOutAction(attendanceId: string) {
  await approveClockOut(attendanceId);
  revalidatePath('/mis/attendance');
}
export async function editAttendanceAction(attendanceId: string, data: { status?: string; notes?: string }) {
  await editAttendance(attendanceId, data);
  revalidatePath('/mis/attendance');
}
export async function requestLeaveAction(employeeId: string, date: string, reason?: string) {
  await requestLeave(employeeId, date, reason);
  revalidatePath('/mis/attendance');
}
export async function approveLeaveAction(leaveId: string, approve: boolean) {
  await approveLeave(leaveId, approve);
  revalidatePath('/mis/attendance');
}
export async function saveShiftAction(id: string | null, data: { name: string; startTime: string; endTime: string }) {
  await saveShift(id, data);
  revalidatePath('/mis/attendance');
}
export async function markAbsentBulkAction(employeeIds: string[], date?: string) {
  await markAbsentBulk(employeeIds, date);
  revalidatePath('/mis/attendance');
}

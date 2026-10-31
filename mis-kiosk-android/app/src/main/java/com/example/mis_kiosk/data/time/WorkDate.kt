package com.example.mis_kiosk.data.time

import java.time.Instant
import java.time.ZoneId

/** A shift's clock window, as cached from the pull (`"HH:MM"` strings). */
data class ShiftWindow(val id: String, val startTime: String, val endTime: String)

data class WorkDateResult(val workDate: String, val shiftId: String?)

/**
 * Pure Kotlin port of the server's `workDateFor` (`src/lib/mis/attendance-day.ts`, with the shift
 * arithmetic from `src/lib/mis/shift-window.ts`). R3 B68: the tablet must agree with the server on
 * which attendance day a punch belongs to, or a night-shift worker clocking out at 05:30 is told
 * their IN is "from a previous day" and is pre-selected for IN again.
 *
 * A night shift (22:00-06:00) crosses midnight and its small-hours minutes belong to the day it
 * STARTED. The shift is the stated one ([hintShiftId]) when it names a real shift, otherwise the
 * shift whose window contains the instant. No shift at all -> the calendar day.
 */
object WorkDate {
    fun workDateFor(
        at: Instant,
        shifts: List<ShiftWindow>,
        zone: ZoneId,
        hintShiftId: String? = null,
    ): WorkDateResult {
        val local = at.atZone(zone)
        val calendar = local.toLocalDate()
        val minute = local.hour * 60 + local.minute
        val hinted = hintShiftId?.let { id -> shifts.firstOrNull { it.id == id } }
        val shift = hinted ?: shifts.firstOrNull { isMinuteInShiftWindow(minute, it) }
            ?: return WorkDateResult(calendar.toString(), null)

        val belongsToPreviousDay = shiftWrapsMidnight(shift) && minute < overnightCutoffMinute(shift)
        val day = if (belongsToPreviousDay) calendar.minusDays(1) else calendar
        return WorkDateResult(day.toString(), shift.id)
    }

    /** `"HH:MM"` -> minutes since midnight. Malformed input reads as 0, never throws. */
    internal fun timeToMinutes(hhmm: String): Int {
        val parts = hhmm.split(':')
        val h = parts.getOrNull(0)?.trim()?.toIntOrNull() ?: 0
        val m = parts.getOrNull(1)?.trim()?.toIntOrNull() ?: 0
        return h * 60 + m
    }

    /**
     * R2-235 / R2-246: mirror of the server's `overnightCutoffMinute` — the small-hours minute up to which a punch
     * still belongs to last night's shift: its end, extended for overtime up to the 16-hour maximum stretch.
     * A 19:00-07:00 shift keeps its 07:15 overtime clock-out instead of pre-selecting IN.
     */
    internal fun overnightCutoffMinute(shift: ShiftWindow): Int =
        maxOf(timeToMinutes(shift.endTime), timeToMinutes(shift.startTime) + MAX_SHIFT_SPAN_HOURS * 60 - 24 * 60)

    private const val MAX_SHIFT_SPAN_HOURS = 16

    internal fun shiftWrapsMidnight(shift: ShiftWindow): Boolean =
        timeToMinutes(shift.endTime) <= timeToMinutes(shift.startTime)

    internal fun isMinuteInShiftWindow(minuteOfDay: Int, shift: ShiftWindow): Boolean {
        val start = timeToMinutes(shift.startTime)
        val end = timeToMinutes(shift.endTime)
        return if (end > start) minuteOfDay in start until end else minuteOfDay >= start || minuteOfDay < end
    }
}

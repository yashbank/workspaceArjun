package com.example.mis_kiosk.data.repository

import com.example.mis_kiosk.data.network.dto.PunchKind
import com.example.mis_kiosk.data.time.FactoryDay
import com.example.mis_kiosk.data.time.ShiftWindow
import com.example.mis_kiosk.data.time.WorkDate
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The direction the confirm card pre-selects, plus an optional explanation for the operator. */
data class NextKind(val kind: String, val hint: String? = null)

/** Past this long since the last IN, a missing OUT is assumed even within the same factory day. */
const val MISSED_OUT_AFTER_MILLIS = 14L * 60 * 60 * 1000

/**
 * Pure decision behind [PunchRepository.nextKindFor] (D8). A punch still queued for this person
 * wins outright. Otherwise the toggle follows the last local direction, except that an IN left
 * over from an earlier factory work date or more than 14 h old is treated as a forgotten
 * clock-out, so the next punch defaults to IN rather than a phantom OUT. The confirm card always
 * lets the operator flip the result, so this never blocks anyone.
 *
 * R3 B68: "earlier work date" is the server's rule ([WorkDate], night shifts belong to the day
 * they started), computed for *now* with the same shift ([shiftId] hint). That is why a night
 * worker who clocked IN at 22:10 is correctly offered OUT at 05:30. [lastWorkDate] is what the
 * server (or [WorkDate]) said at punch time; for rows from before that existed it is derived from
 * the punch instant. With no cached shifts (an older server) the old 06:00 boundary applies.
 */
fun decideNextKind(
    pendingKind: String?,
    lastDirection: String?,
    lastPunchedAtMillis: Long?,
    nowMillis: Long,
    zone: ZoneId = ZoneId.systemDefault(),
    lastWorkDate: String? = null,
    shifts: List<ShiftWindow> = emptyList(),
    shiftId: String? = null,
): NextKind {
    if (pendingKind == PunchKind.IN) return NextKind(PunchKind.OUT)
    if (pendingKind == PunchKind.OUT) return NextKind(PunchKind.IN)
    if (lastDirection != "IN") return NextKind(PunchKind.IN)
    if (lastPunchedAtMillis == null) return NextKind(PunchKind.OUT)

    val tooOld = nowMillis - lastPunchedAtMillis > MISSED_OUT_AFTER_MILLIS
    val fromEarlierDay = if (shifts.isEmpty()) {
        lastPunchedAtMillis < FactoryDay.startMillis(nowMillis, zone)
    } else {
        val then = lastWorkDate
            ?: WorkDate.workDateFor(Instant.ofEpochMilli(lastPunchedAtMillis), shifts, zone, shiftId).workDate
        val now = WorkDate.workDateFor(Instant.ofEpochMilli(nowMillis), shifts, zone, shiftId).workDate
        then < now // ISO dates compare chronologically as strings
    }
    if (!fromEarlierDay && !tooOld) return NextKind(PunchKind.OUT)

    val last = Instant.ofEpochMilli(lastPunchedAtMillis).atZone(zone)
    val today = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
    val day = when (last.toLocalDate()) {
        today -> "today"
        today.minusDays(1) -> "yesterday"
        else -> last.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))
    }
    val time = last.format(DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH))
    return NextKind(PunchKind.IN, "Last punch: IN $day $time — assumed a missed OUT")
}

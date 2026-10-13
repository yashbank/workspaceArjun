package com.example.mis_kiosk.data.time

import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

/**
 * The factory day rolls over at 06:00 local time, not at midnight (a night shift's punches belong
 * to the day it started). One shared definition, used by the "IN at this gate today" count and by
 * the missed-clock-out detection so the two can never disagree.
 */
object FactoryDay {
    const val START_HOUR = 6

    /** R3 B68: the factory's zone from the pull's `factoryTimezone`; the device zone when absent
     *  or not a zone this JVM knows (an older server, a typo - never a crash). */
    fun zoneFrom(timezoneId: String?): ZoneId =
        timezoneId?.takeIf { it.isNotBlank() }?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()

    /** Epoch millis of the most recent 06:00 local boundary at or before [nowMillis]. */
    fun startMillis(nowMillis: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): Long {
        val now = Instant.ofEpochMilli(nowMillis).atZone(zone)
        var start = now.toLocalDate().atTime(LocalTime.of(START_HOUR, 0)).atZone(zone)
        if (now.isBefore(start)) start = start.minusDays(1)
        return start.toInstant().toEpochMilli()
    }

    /** Epoch millis of the next 06:00 boundary after [nowMillis]. */
    fun nextStartMillis(nowMillis: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): Long {
        val start = Instant.ofEpochMilli(startMillis(nowMillis, zone)).atZone(zone)
        return start.plusDays(1).toInstant().toEpochMilli()
    }
}

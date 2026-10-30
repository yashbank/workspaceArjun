package com.example.mis_kiosk.data.time

import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Test vectors copied from the server's `src/lib/mis/attendance-day.test.ts`, describe block
 * "which day does a punch belong to? (night shift, D20)" plus the zone cases from the later
 * "factory timezone (D22)" block. Same shifts, same expectations: if the two ever disagree the
 * tablet pre-selects the wrong direction for a night worker.
 */
class WorkDateTest {
    private val ist = ZoneId.of("Asia/Kolkata")
    private val sgt = ZoneId.of("Asia/Singapore")
    private val s1 = ShiftWindow("s1", "06:00", "14:00")
    private val s2 = ShiftWindow("s2", "14:00", "22:00")
    private val night = ShiftWindow("n", "22:00", "06:00")
    private val shifts = listOf(s1, s2, night)

    /** Server helper: `at(day, h, m, month = 8)` is an IST wall-clock reading in September 2026. */
    private fun at(day: Int, h: Int, m: Int = 0, month: Int = 9) =
        ZonedDateTime.of(2026, month, day, h, m, 0, 0, ist).toInstant()

    private fun wd(day: Int, h: Int, m: Int, zone: ZoneId = ist, list: List<ShiftWindow> = shifts, hint: String? = null, month: Int = 9) =
        WorkDate.workDateFor(at(day, h, m, month), list, zone, hint)

    @Test // 'a day-shift punch is that calendar day'
    fun dayShiftPunchIsThatCalendarDay() {
        assertEquals(WorkDateResult("2026-09-20", "s1"), wd(20, 6, 4))
    }

    @Test // 'THE NIGHT SHIFT: a 00:10 clock-in for a 22:00 start is the PREVIOUS day'
    fun nightShiftSmallHoursBelongToThePreviousDay() {
        assertEquals(WorkDateResult("2026-09-20", "n"), wd(21, 0, 10))
    }

    @Test // 'a 22:30 clock-in for the night shift is the same calendar day'
    fun nightShiftEveningIsTheSameCalendarDay() {
        assertEquals(WorkDateResult("2026-09-20", "n"), wd(20, 22, 30))
    }

    @Test // 'the device's stated shift beats the clock: 05:50 for a 06:00 day shift is NOT last night's'
    fun statedShiftBeatsTheClock() {
        assertEquals("2026-09-20", wd(21, 5, 50).workDate)
        assertEquals(WorkDateResult("2026-09-21", "s1"), wd(21, 5, 50, hint = "s1"))
    }

    @Test // 'ignores a hint that names no real shift, rather than trusting it'
    fun unknownHintIsIgnored() {
        assertEquals(WorkDateResult("2026-09-20", "s1"), wd(20, 6, 4, hint = "nope"))
    }

    @Test // 'falls back to the calendar day when no shift exists at all'
    fun noShiftsFallsBackToTheCalendarDay() {
        assertEquals(WorkDateResult("2026-09-21", null), wd(21, 0, 10, list = emptyList()))
    }

    @Test // 'crosses a month boundary correctly' (1 Oct 00:30 -> 30 Sep)
    fun crossesAMonthBoundary() {
        assertEquals("2026-09-30", wd(1, 0, 30, month = 10).workDate)
    }

    @Test // 'a night-shift clock-out at 05:50 IST belongs to last night in India but to a NEW day on the database's clock'
    fun theFactoryZoneNotTheDatabaseZoneDecides() {
        assertEquals(WorkDateResult("2026-09-20", "n"), wd(21, 5, 50))
        assertEquals(WorkDateResult("2026-09-21", "s1"), wd(21, 5, 50, zone = sgt))
    }

    @Test // 'a punch that crosses midnight in one zone but not the other files under a different calendar day'
    fun midnightInOneZoneButNotTheOther() {
        assertEquals("2026-09-20", wd(20, 23, 30, list = emptyList()).workDate)
        assertEquals("2026-09-21", wd(20, 23, 30, zone = sgt, list = emptyList()).workDate)
    }

    @Test
    fun malformedShiftTimesReadAsZeroRatherThanThrowing() {
        val broken = listOf(ShiftWindow("x", "??", ""))
        // start == end == 0 -> treated as wrapping the whole day; must simply not crash.
        assertEquals("2026-09-20", wd(20, 6, 4, list = broken).workDate)
    }

    private val night2 = ShiftWindow("n2", "19:00", "07:00")

    @Test // R2-235: overtime OUT after the shift end stays on the shift's start day
    fun nightShiftOvertimeOutStaysOnStartDay() {
        assertEquals(WorkDateResult("2026-09-20", "n2"), wd(21, 7, 15, list = listOf(night2), hint = "n2"))
    }

    @Test // R2-52 kept: next evening's 19:00 scan is today, not yesterday
    fun nightShiftNextEveningScanIsToday() {
        assertEquals(WorkDateResult("2026-09-21", "n2"), wd(21, 19, 0, list = listOf(night2), hint = "n2"))
    }

    @Test // 16 h cutoff for 22:00-06:00: 13:59 is still yesterday's shift, 14:00 is today
    fun nightShiftSixteenHourCutoff() {
        assertEquals("2026-09-20", wd(21, 13, 59, hint = "n").workDate)
        assertEquals("2026-09-21", wd(21, 14, 0, hint = "n").workDate)
    }
}

package com.example.mis_kiosk.data.time

import com.example.mis_kiosk.data.network.dto.PunchKind
import com.example.mis_kiosk.data.repository.decideNextKind
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.TimeZone
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** R3-AND B68: the IN/OUT toggle follows the factory work date, not the 06:00 wall-clock boundary. */
class NextKindFactoryDayTest {
    private val ist = ZoneId.of("Asia/Kolkata")
    private val originalDefault = TimeZone.getDefault()
    private val shifts = listOf(
        ShiftWindow("s1", "06:00", "14:00"),
        ShiftWindow("s2", "14:00", "22:00"),
        ShiftWindow("n", "22:00", "06:00"),
    )

    @After
    fun restoreZone() = TimeZone.setDefault(originalDefault)

    private fun at(d: Int, h: Int, m: Int) = ZonedDateTime.of(2026, 10, d, h, m, 0, 0, ist).toInstant().toEpochMilli()

    @Test
    fun nightShiftInAt2210IsStillOutAt0530TheNextMorning() {
        // The old 06:00 boundary called this IN "stale" and offered a phantom second IN.
        val r = decideNextKind(null, "IN", at(12, 22, 10), at(13, 5, 30), ist, lastWorkDate = "2026-10-12", shifts = shifts, shiftId = "n")
        assertEquals(PunchKind.OUT, r.kind)
        assertNull(r.hint)
    }

    @Test
    fun sameAnswerWhenTheLastWorkDateIsUnknownAndDerivedFromThePunchInstant() {
        val r = decideNextKind(null, "IN", at(12, 22, 10), at(13, 5, 30), ist, lastWorkDate = null, shifts = shifts, shiftId = "n")
        assertEquals(PunchKind.OUT, r.kind)
    }

    @Test
    fun dayShiftInAt0900YesterdayIsAMissedOutAt0900() {
        val r = decideNextKind(null, "IN", at(12, 9, 0), at(13, 9, 0), ist, lastWorkDate = "2026-10-12", shifts = shifts, shiftId = "s1")
        assertEquals(PunchKind.IN, r.kind)
        assertEquals("Last punch: IN yesterday 09:00 — assumed a missed OUT", r.hint)
    }

    @Test
    fun anEarlierWorkDateAloneIsEnoughEvenUnder14Hours() {
        // Night-shift IN 22:10 on the 12th; at 12:00 on the 13th (13h50m later) the day shift has begun.
        val r = decideNextKind(null, "IN", at(12, 22, 10), at(13, 12, 0), ist, lastWorkDate = "2026-10-12", shifts = shifts, shiftId = "s1")
        assertEquals(PunchKind.IN, r.kind)
    }

    @Test
    fun moreThan14HoursIsStaleEvenOnTheSameWorkDate() {
        val r = decideNextKind(null, "IN", at(12, 6, 30), at(12, 21, 0), ist, lastWorkDate = "2026-10-12", shifts = shifts, shiftId = "s1")
        assertEquals(PunchKind.IN, r.kind)
    }

    @Test
    fun tabletInUtcWithFactoryTimezoneKolkataGivesTheSameAnswers() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"))
        val zone = FactoryDay.zoneFrom("Asia/Kolkata")
        assertEquals(ist, zone)

        val night = decideNextKind(null, "IN", at(12, 22, 10), at(13, 5, 30), zone, lastWorkDate = null, shifts = shifts, shiftId = "n")
        assertEquals(PunchKind.OUT, night.kind)
        val day = decideNextKind(null, "IN", at(12, 9, 0), at(13, 9, 0), zone, lastWorkDate = null, shifts = shifts, shiftId = "s1")
        assertEquals(PunchKind.IN, day.kind)
    }

    @Test
    fun missingOrUnknownFactoryTimezoneKeepsTheDeviceZone() {
        assertEquals(ZoneId.systemDefault(), FactoryDay.zoneFrom(null))
        assertEquals(ZoneId.systemDefault(), FactoryDay.zoneFrom(""))
        assertEquals(ZoneId.systemDefault(), FactoryDay.zoneFrom("Mars/Olympus"))
    }

    @Test
    fun withNoCachedShiftsTheOldSixAmBoundaryStillApplies() {
        // Older server, no shift list: unchanged behaviour (the factory day rolls over at 06:00).
        assertEquals(PunchKind.OUT, decideNextKind(null, "IN", at(12, 22, 10), at(13, 5, 30), ist, shifts = emptyList()).kind)
        assertEquals(PunchKind.IN, decideNextKind(null, "IN", at(12, 22, 10), at(13, 6, 30), ist, shifts = emptyList()).kind)
    }
}

package com.example.mis_kiosk.data.time

import com.example.mis_kiosk.data.network.dto.PunchKind
import com.example.mis_kiosk.data.repository.decideNextKind
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NextKindTest {
    private val zone = ZoneId.of("Asia/Kolkata")
    private fun at(d: Int, h: Int, m: Int) = ZonedDateTime.of(2026, 10, d, h, m, 0, 0, zone).toInstant().toEpochMilli()

    @Test
    fun queuedKindWinsAndNeverCarriesAHint() {
        val r = decideNextKind(PunchKind.IN, "OUT", at(12, 7, 0), at(12, 9, 0), zone)
        assertEquals(PunchKind.OUT, r.kind)
        assertNull(r.hint)
    }

    @Test
    fun recentInSameDayGoesToOut() {
        val r = decideNextKind(null, "IN", at(12, 7, 0), at(12, 14, 0), zone)
        assertEquals(PunchKind.OUT, r.kind)
        assertNull(r.hint)
    }

    @Test
    fun inFromYesterdayAssumesMissedOutAndSaysSo() {
        val r = decideNextKind(null, "IN", at(11, 14, 5), at(12, 8, 0), zone)
        assertEquals(PunchKind.IN, r.kind)
        assertEquals("Last punch: IN yesterday 14:05 — assumed a missed OUT", r.hint)
    }

    @Test
    fun inOlderThan14HoursWithinTheSameFactoryDayAlsoAssumesMissedOut() {
        // 06:30 -> 21:00 is 14.5 h but still the same factory day.
        val r = decideNextKind(null, "IN", at(12, 6, 30), at(12, 21, 0), zone)
        assertEquals(PunchKind.IN, r.kind)
    }

    @Test
    fun noStateOrLastOutGoesToIn() {
        assertEquals(PunchKind.IN, decideNextKind(null, null, null, at(12, 8, 0), zone).kind)
        assertEquals(PunchKind.IN, decideNextKind(null, "OUT", at(12, 7, 0), at(12, 8, 0), zone).kind)
    }
}

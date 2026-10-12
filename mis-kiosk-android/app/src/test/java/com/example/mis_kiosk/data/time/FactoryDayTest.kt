package com.example.mis_kiosk.data.time

import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

class FactoryDayTest {
    private val zone = ZoneId.of("Asia/Kolkata")
    private fun at(y: Int, m: Int, d: Int, h: Int, min: Int) =
        ZonedDateTime.of(y, m, d, h, min, 0, 0, zone).toInstant().toEpochMilli()

    @Test
    fun afternoonBelongsToTodays0600() {
        assertEquals(at(2026, 10, 12, 6, 0), FactoryDay.startMillis(at(2026, 10, 12, 14, 5), zone))
    }

    @Test
    fun beforeSixBelongsToYesterdaysDay() {
        assertEquals(at(2026, 10, 11, 6, 0), FactoryDay.startMillis(at(2026, 10, 12, 2, 30), zone))
    }

    @Test
    fun exactlySixStartsTheNewDay() {
        assertEquals(at(2026, 10, 12, 6, 0), FactoryDay.startMillis(at(2026, 10, 12, 6, 0), zone))
    }

    @Test
    fun nextStartIsTomorrowSix() {
        assertEquals(at(2026, 10, 13, 6, 0), FactoryDay.nextStartMillis(at(2026, 10, 12, 14, 5), zone))
        assertEquals(at(2026, 10, 12, 6, 0), FactoryDay.nextStartMillis(at(2026, 10, 12, 2, 30), zone))
    }
}

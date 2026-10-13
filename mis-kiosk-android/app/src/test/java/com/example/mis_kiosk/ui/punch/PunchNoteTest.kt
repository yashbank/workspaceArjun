package com.example.mis_kiosk.ui.punch

import com.example.mis_kiosk.data.repository.FlushStop
import com.example.mis_kiosk.data.work.shouldRetryFlush
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PunchNoteTest {
    @Test
    fun alreadyInAndNoOpenInHaveOperatorText() {
        assertEquals("Already clocked IN (no change)", punchNoteText("ALREADY_IN"))
        assertEquals("OUT recorded without an IN today", punchNoteText("NO_OPEN_IN"))
    }

    @Test
    fun absentOrUnknownNotesShowNothing() {
        assertNull(punchNoteText(null))
        assertNull(punchNoteText("SOMETHING_NEW"))
    }

    @Test
    fun revokedScreenMessageCountsTheUnsentPunches() {
        assertNull(unsentAfterWipeText(0))
        assertEquals("1 punch could not be sent from this tablet. Re-pair to send them.", unsentAfterWipeText(1))
        assertEquals("3 punches could not be sent from this tablet. Re-pair to send them.", unsentAfterWipeText(3))
    }

    // B69: the WorkManager decision (TestListenableWorkerBuilder would need an extra androidTest
    // dependency outside this cluster's file list, so the decision is a pure function).
    @Test
    fun workerRetriesOnlyATransientStopWithRowsStillPending() {
        assertTrue(shouldRetryFlush(FlushStop.RETRY_NEEDED, stillPending = true))
        assertFalse(shouldRetryFlush(FlushStop.RETRY_NEEDED, stillPending = false))
        assertFalse(shouldRetryFlush(FlushStop.NEEDS_REPAIR, stillPending = true)) // 401: not transient
        assertFalse(shouldRetryFlush(FlushStop.REVOKED, stillPending = true))
        assertFalse(shouldRetryFlush(FlushStop.DRAINED, stillPending = true))
    }
}

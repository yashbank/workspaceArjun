package com.example.mis_kiosk.ui.queue

import com.example.mis_kiosk.data.local.PunchQueueStatus
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** R2-243 / R2-254: which queue rows the operator may dismiss from the Offline queue screen. */
class QueueDismissTest {
    @Test
    fun answeredRowsCanBeDismissed() {
        assertTrue(QueueViewModel.canDismiss(PunchQueueStatus.PARKED))
        assertTrue(QueueViewModel.canDismiss(PunchQueueStatus.REJECTED))
        assertTrue(QueueViewModel.canDismiss(PunchQueueStatus.STUCK))
    }

    @Test
    fun aPendingRowNeverIs() {
        assertFalse(QueueViewModel.canDismiss(PunchQueueStatus.PENDING))
        assertFalse(QueueViewModel.canDismiss("SOMETHING_ELSE"))
    }
}

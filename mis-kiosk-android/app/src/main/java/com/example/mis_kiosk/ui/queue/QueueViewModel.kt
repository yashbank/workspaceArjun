package com.example.mis_kiosk.ui.queue

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.mis_kiosk.data.local.PunchQueueDao
import com.example.mis_kiosk.data.local.PunchQueueDatabase
import com.example.mis_kiosk.data.local.PunchQueueEntity
import com.example.mis_kiosk.data.local.PunchQueueStatus
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * K2 — offline sync queue. Every entry in the local punch queue (PENDING, PARKED, REJECTED,
 * STUCK), newest first. Reuses the same [PunchQueueDao] that backs
 * [com.example.mis_kiosk.data.repository.PunchRepository]. R2-243 / R2-254: an acknowledged
 * PARKED / REJECTED / STUCK row can be dismissed here (same delete as the punch screen's
 * "needs attention" list); a PENDING row only ever leaves the queue by actually syncing.
 */
class QueueViewModel(application: Application) : AndroidViewModel(application) {
    private val punchQueueDao: PunchQueueDao = PunchQueueDatabase.getInstance(application).punchQueueDao()

    val entries: StateFlow<List<PunchQueueEntity>> = punchQueueDao.observeAllOrdered()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** R2-243: clears one acknowledged entry after the operator confirmed. Refuses a PENDING row. */
    fun dismiss(entry: PunchQueueEntity) {
        if (!canDismiss(entry.status)) return
        viewModelScope.launch { punchQueueDao.delete(entry.key) }
    }

    companion object {
        /** Only rows the server has already answered (or given up on) may be cleared by hand. */
        fun canDismiss(status: String): Boolean =
            status == PunchQueueStatus.PARKED || status == PunchQueueStatus.REJECTED || status == PunchQueueStatus.STUCK
    }
}

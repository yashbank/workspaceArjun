package com.example.mis_kiosk.ui.queue

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.mis_kiosk.data.local.PunchQueueDao
import com.example.mis_kiosk.data.local.PunchQueueDatabase
import com.example.mis_kiosk.data.local.PunchQueueEntity
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * K2 — offline sync queue. Read-only view of every entry in the local punch queue
 * (PENDING, PARKED, and REJECTED), newest first. Reuses the same [PunchQueueDao] that
 * backs [com.example.mis_kiosk.data.repository.PunchRepository]; this screen adds no
 * new queue-mutation path.
 */
class QueueViewModel(application: Application) : AndroidViewModel(application) {
    private val punchQueueDao: PunchQueueDao = PunchQueueDatabase.getInstance(application).punchQueueDao()

    val entries: StateFlow<List<PunchQueueEntity>> = punchQueueDao.observeAllOrdered()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** Same delete as PunchRepository.dismiss(key); local row only. */
    fun dismiss(key: String) {
        viewModelScope.launch { punchQueueDao.delete(key) }
    }
}

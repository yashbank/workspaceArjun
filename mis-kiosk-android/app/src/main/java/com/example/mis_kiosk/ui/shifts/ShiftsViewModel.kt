package com.example.mis_kiosk.ui.shifts

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.mis_kiosk.data.local.EmployeeDao
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.local.ShiftSummary
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class ShiftsState(
    val shifts: List<ShiftSummary> = emptyList(),
    val loading: Boolean = true,
)

/**
 * Read-only info screen (no backend call) — reuses the already-synced roster cache the
 * punch flow and [com.example.mis_kiosk.ui.health.DeviceHealthViewModel] both read from.
 * Creating/editing shifts is a web-admin-portal job, out of scope for this tablet.
 *
 * Observes the roster reactively (not a one-shot query) — this kiosk stays running for a
 * whole shift, so a background roster re-sync must update this screen if it's left open,
 * the same way DeviceHealthViewModel polls for its own long-lived diagnostic view.
 */
class ShiftsViewModel(application: Application) : AndroidViewModel(application) {
    private val employeeDao: EmployeeDao = RosterDatabase.getInstance(application).employeeDao()

    val state: StateFlow<ShiftsState> = employeeDao.observeShiftSummaries()
        .map { ShiftsState(shifts = it, loading = false) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ShiftsState())
}

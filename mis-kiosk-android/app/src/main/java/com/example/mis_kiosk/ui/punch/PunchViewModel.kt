package com.example.mis_kiosk.ui.punch

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.mis_kiosk.data.local.PunchQueueDatabase
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.local.RosterPreferences
import com.example.mis_kiosk.data.network.ApiClient
import com.example.mis_kiosk.data.network.KioskApi
import com.example.mis_kiosk.data.repository.PunchAttemptResult
import com.example.mis_kiosk.data.repository.PunchRepository
import com.example.mis_kiosk.data.repository.RosterRepository
import com.example.mis_kiosk.data.repository.RosterSyncResult
import com.example.mis_kiosk.data.security.DeviceCredentialStore
import com.example.mis_kiosk.data.work.PunchFlushScheduler
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** The attempt behind a [PunchSubmission.RetryPrompt] currently on screen — reused verbatim
 *  on retry (same key, same kind, same clientRecordedAt) rather than re-timestamped (D15).
 *  It's already durably queued in Room by the time this is held; this is just enough to call
 *  [PunchRepository.retry] again without re-reading the database. */
private class PendingAttempt(
    val employeeId: String,
    val employeeName: String,
    val badgeCode: String,
    val shiftId: String?,
    val kind: String,
    val key: String,
    val clientRecordedAtIso: String,
)

class PunchViewModel @JvmOverloads constructor(
    application: Application,
    private val api: KioskApi = ApiClient.kioskApi,
) : AndroidViewModel(application) {

    private val credentialStore = DeviceCredentialStore(application)
    private val database = RosterDatabase.getInstance(application)
    private val employeeDao = database.employeeDao()
    private val rosterRepository = RosterRepository(
        context = application,
        api = api,
        database = database,
        rosterPreferences = RosterPreferences(application),
        credentialStore = credentialStore,
    )
    private val punchRepository = PunchRepository(
        context = application,
        api = api,
        punchStateDao = database.punchStateDao(),
        punchQueueDao = PunchQueueDatabase.getInstance(application).punchQueueDao(),
        credentialStore = credentialStore,
    )

    val deviceName: String = credentialStore.activeDevice?.name ?: "This tablet"

    private val syncing = MutableStateFlow(false)
    private val syncError = MutableStateFlow<String?>(null)
    private val revoked = MutableStateFlow(false)

    val uiState: StateFlow<PunchUiState> = combine(
        rosterRepository.employees,
        syncing,
        syncError,
        revoked,
        punchRepository.pendingCount,
    ) { employees, isSyncing, error, isRevoked, queuedCount ->
        when {
            isRevoked -> PunchUiState.Revoked
            employees.isEmpty() && error != null -> PunchUiState.Error(error)
            employees.isEmpty() && isSyncing -> PunchUiState.Loading
            else -> PunchUiState.Ready(
                employeeCount = employees.size,
                lastSyncedAtMillis = rosterRepository.lastSyncedAtMillis,
                syncing = isSyncing,
                syncError = if (employees.isNotEmpty()) error else null,
                queuedCount = queuedCount,
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), PunchUiState.Loading)

    val needsAttention = punchRepository.needsAttention
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _badgeInput = MutableStateFlow("")
    val badgeInput: StateFlow<String> = _badgeInput.asStateFlow()

    private val _submission = MutableStateFlow<PunchSubmission?>(null)
    val submission: StateFlow<PunchSubmission?> = _submission.asStateFlow()

    private var pending: PendingAttempt? = null

    init {
        refresh()
        PunchFlushScheduler.schedule(application)
    }

    fun refresh() {
        if (syncing.value) return
        syncing.value = true
        syncError.value = null
        viewModelScope.launch {
            when (val result = rosterRepository.sync()) {
                is RosterSyncResult.Success -> syncError.value = null
                is RosterSyncResult.Failure -> syncError.value = result.message
                RosterSyncResult.Revoked -> revoked.value = true
                RosterSyncResult.NotPaired -> syncError.value = "This tablet is not paired."
            }
            syncing.value = false
        }
    }

    fun onBadgeInputChange(value: String) {
        _badgeInput.value = value
    }

    fun submitBadge() {
        val typed = _badgeInput.value.trim()
        if (typed.isEmpty()) return
        _submission.value = PunchSubmission.InProgress
        viewModelScope.launch {
            // The server itself uppercases badgeCode before matching (attendance-punch.ts) —
            // match the same way locally so case never causes a spurious "not recognised".
            val employee = employeeDao.findByBadgeCode(typed) ?: employeeDao.findByBadgeCode(typed.uppercase())
            if (employee == null) {
                _submission.value = PunchSubmission.Invalid("Badge not recognised: $typed")
                return@launch
            }
            val attempt = PendingAttempt(
                employeeId = employee.id,
                employeeName = employee.name,
                badgeCode = employee.badgeCode,
                shiftId = employee.shiftId,
                kind = punchRepository.nextKindFor(employee.id),
                key = UUID.randomUUID().toString(),
                clientRecordedAtIso = Instant.now().toString(),
            )
            pending = attempt
            val result = punchRepository.enqueueAndAttempt(
                employeeId = attempt.employeeId,
                employeeName = attempt.employeeName,
                badgeCode = attempt.badgeCode,
                shiftId = attempt.shiftId,
                kind = attempt.kind,
                key = attempt.key,
                clientRecordedAtIso = attempt.clientRecordedAtIso,
            )
            applyResult(attempt, result)
        }
    }

    fun retry() {
        val attempt = pending ?: return
        _submission.value = PunchSubmission.InProgress
        viewModelScope.launch {
            val result = punchRepository.retry(
                employeeId = attempt.employeeId,
                badgeCode = attempt.badgeCode,
                shiftId = attempt.shiftId,
                kind = attempt.kind,
                key = attempt.key,
                clientRecordedAtIso = attempt.clientRecordedAtIso,
            )
            applyResult(attempt, result)
        }
    }

    /** Dismisses the on-screen result. A still-PENDING attempt (RetryPrompt) stays in the
     *  durable queue and will be picked up by the next flush even after this dismiss —
     *  nothing here deletes it. */
    fun dismissSubmission() {
        _submission.value = null
        pending = null
        _badgeInput.value = ""
    }

    fun dismissNeedsAttention(key: String) {
        viewModelScope.launch { punchRepository.dismiss(key) }
    }

    private fun applyResult(attempt: PendingAttempt, result: PunchAttemptResult) {
        _submission.value = when (result) {
            is PunchAttemptResult.Applied -> {
                pending = null
                PunchSubmission.Success(
                    employeeName = result.result.employeeName,
                    direction = result.result.direction,
                    wasDuplicate = result.wasDuplicate,
                )
            }
            is PunchAttemptResult.Parked -> {
                pending = null
                PunchSubmission.NeedsAttention(attempt.employeeName, result.detail ?: "This punch needs review.")
            }
            is PunchAttemptResult.Rejected -> {
                pending = null
                PunchSubmission.Invalid(result.detail ?: "This punch could not be recorded.")
            }
            is PunchAttemptResult.RetryNeeded -> {
                PunchFlushScheduler.schedule(getApplication())
                PunchSubmission.RetryPrompt(attempt.employeeName, result.detail ?: "Could not reach the server.")
            }
        }
    }
}

package com.example.mis_kiosk.ui.punch

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.mis_kiosk.data.local.EmployeeEntity
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
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** The attempt behind a [PunchSubmission.RetryPrompt] currently on screen — reused verbatim
 *  on retry (same key, same kind, same clientRecordedAt) rather than re-timestamped (D15). */
private class PendingAttempt(
    val employeeId: String,
    val employeeName: String,
    val badgeCode: String,
    val shiftId: String?,
    val kind: String,
    val key: String,
    val clientRecordedAtIso: String,
)

private const val ROSTER_SYNC_INTERVAL_MS = 60_000L

private data class RosterSnapshot(
    val employees: List<EmployeeEntity>,
    val syncing: Boolean,
    val syncError: String?,
    val revoked: Boolean,
    val queuedCount: Int,
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

    private val rosterSnapshot: StateFlow<RosterSnapshot> = combine(
        rosterRepository.employees,
        syncing,
        syncError,
        revoked,
        punchRepository.pendingCount,
    ) { employees, isSyncing, error, isRevoked, queuedCount ->
        RosterSnapshot(employees, isSyncing, error, isRevoked, queuedCount)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), RosterSnapshot(emptyList(), true, null, false, 0))

    val uiState: StateFlow<PunchUiState> = combine(
        rosterSnapshot,
        database.punchStateDao().observeClockedInCount(),
    ) { snapshot, clockedIn ->
        when {
            snapshot.revoked -> PunchUiState.Revoked
            snapshot.employees.isEmpty() && snapshot.syncError != null -> PunchUiState.Error(snapshot.syncError)
            snapshot.employees.isEmpty() && snapshot.syncing -> PunchUiState.Loading
            else -> PunchUiState.Ready(
                employeeCount = snapshot.employees.size,
                lastSyncedAtMillis = rosterRepository.lastSyncedAtMillis,
                syncing = snapshot.syncing,
                syncError = if (snapshot.employees.isNotEmpty()) snapshot.syncError else null,
                queuedCount = snapshot.queuedCount,
                clockedInCount = clockedIn,
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), PunchUiState.Loading)

    val needsAttention = punchRepository.needsAttention
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _mode = MutableStateFlow<PunchMode>(PunchMode.Idle)
    val mode: StateFlow<PunchMode> = _mode.asStateFlow()

    private val _badgeInput = MutableStateFlow("")
    val badgeInput: StateFlow<String> = _badgeInput.asStateFlow()

    private val _manualMatch = MutableStateFlow<EmployeeEntity?>(null)
    val manualMatch: StateFlow<EmployeeEntity?> = _manualMatch.asStateFlow()

    private val _scanHint = MutableStateFlow<String?>(null)
    val scanHint: StateFlow<String?> = _scanHint.asStateFlow()

    private val _submission = MutableStateFlow<PunchSubmission?>(null)
    val submission: StateFlow<PunchSubmission?> = _submission.asStateFlow()

    private var pending: PendingAttempt? = null
    private var scanHintClearJob: Job? = null

    init {
        refresh()
        PunchFlushScheduler.schedule(application)
        startPeriodicRosterSync()
    }

    /** A kiosk tablet is foreground for its whole shift, so a foreground poll — not
     *  WorkManager's 15-minute periodic-work floor — is what keeps roster changes
     *  (new hires, shift edits) showing up within a minute instead of an admin having
     *  to reboot the tablet to see them. */
    private fun startPeriodicRosterSync() {
        viewModelScope.launch {
            while (true) {
                kotlinx.coroutines.delay(ROSTER_SYNC_INTERVAL_MS)
                refresh()
                // Also nudges any queued punch left behind by a non-network failure (a
                // transient 5xx, say) that neither the network callback nor an open
                // RetryPrompt would otherwise catch — KEEP dedupes this against work
                // already pending, so it's a no-op when there's nothing to flush.
                PunchFlushScheduler.schedule(getApplication())
            }
        }
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

    // ---- Idle / mode switching -------------------------------------------------------

    fun startScanning() {
        _scanHint.value = null
        _mode.value = PunchMode.Scanning
    }

    fun openManualEntry() {
        _badgeInput.value = ""
        _manualMatch.value = null
        _mode.value = PunchMode.ManualEntry
    }

    fun backToIdle() {
        _mode.value = PunchMode.Idle
        _scanHint.value = null
    }

    // ---- Scanning ---------------------------------------------------------------------

    /** Called on every decoded QR frame — may fire repeatedly for the same code while the
     *  camera holds it in frame, so this is deliberately idempotent (re-entering Confirming
     *  with the same employee is harmless; once in Confirming, further scans are ignored by
     *  the screen no longer showing a live camera). */
    fun onQrScanned(rawValue: String) {
        if (_mode.value !is PunchMode.Scanning) return
        viewModelScope.launch {
            val code = rawValue.trim()
            val employee = employeeDao.findByBadgeCode(code) ?: employeeDao.findByBadgeCode(code.uppercase())
            if (employee == null) {
                scanHintClearJob?.cancel()
                _scanHint.value = "Badge not recognised: $code"
                scanHintClearJob = viewModelScope.launch {
                    kotlinx.coroutines.delay(2000)
                    _scanHint.value = null
                }
                return@launch
            }
            val kind = punchRepository.nextKindFor(employee.id)
            _mode.value = PunchMode.Confirming(employee, kind)
        }
    }

    fun confirmScannedPunch() {
        val mode = _mode.value as? PunchMode.Confirming ?: return
        beginAttempt(mode.employee, mode.kind)
    }

    fun rejectConfirmation() {
        _mode.value = PunchMode.Idle
    }

    // ---- Manual entry -------------------------------------------------------------------

    /**
     * Real badge codes at this factory are alphanumeric (`EMP0061`, `EMP-ARJUNCR-4ETG`, ...),
     * not the short numeric IDs the K8 mockup assumed — so this takes whatever the system
     * keyboard produces rather than restricting to a digits-only custom keypad.
     */
    fun onManualInputChange(value: String) {
        _badgeInput.value = value.take(40)
        lookupManualMatch()
    }

    /** Cancelled and relaunched on every keystroke, so an in-flight lookup for a code the
     *  operator has since edited past can never land after (and clobber) a newer one — without
     *  this a fast typist could see a real badge flash "not recognised" if an older, slower
     *  query for a shorter prefix happened to resolve after the final one. */
    private var manualLookupJob: Job? = null

    private fun lookupManualMatch() {
        val code = _badgeInput.value
        manualLookupJob?.cancel()
        if (code.isEmpty()) {
            _manualMatch.value = null
            return
        }
        manualLookupJob = viewModelScope.launch {
            val match = employeeDao.findByBadgeCode(code) ?: employeeDao.findByBadgeCode(code.uppercase())
            _manualMatch.value = match
        }
    }

    fun confirmManualEntry() {
        val employee = _manualMatch.value ?: return
        viewModelScope.launch {
            val kind = punchRepository.nextKindFor(employee.id)
            beginAttempt(employee, kind)
        }
    }

    // ---- Submission ---------------------------------------------------------------------

    private fun beginAttempt(employee: EmployeeEntity, kind: String) {
        // Defense-in-depth: the overlay is now fixed to block touches to the screen behind it
        // (the actual way a second attempt could start mid-flight), but this guard means a
        // second entry point never can, however it's reached.
        if (_submission.value is PunchSubmission.InProgress) {
            android.util.Log.w("PunchViewModel", "beginAttempt ignored: a punch is already in flight")
            return
        }
        _mode.value = PunchMode.Idle
        _submission.value = PunchSubmission.InProgress
        val attempt = PendingAttempt(
            employeeId = employee.id,
            employeeName = employee.name,
            badgeCode = employee.badgeCode,
            shiftId = employee.shiftId,
            kind = kind,
            key = UUID.randomUUID().toString(),
            clientRecordedAtIso = Instant.now().toString(),
        )
        pending = attempt
        viewModelScope.launch {
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
        if (_submission.value is PunchSubmission.InProgress) return
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
        _manualMatch.value = null
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

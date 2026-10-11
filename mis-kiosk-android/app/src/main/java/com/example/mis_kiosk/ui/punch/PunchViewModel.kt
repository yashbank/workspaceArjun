package com.example.mis_kiosk.ui.punch

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.mis_kiosk.data.local.EmployeeEntity
import com.example.mis_kiosk.data.local.PunchQueueDatabase
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.local.RosterPreferences
import com.example.mis_kiosk.data.local.ShiftSummary
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
import kotlinx.coroutines.flow.Flow
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
    /** Operator captured when the punch began; reused verbatim on retry, never re-read. */
    val operatorId: String?,
)

private const val ROSTER_SYNC_INTERVAL_MS = 60_000L
private val OPERATOR_ROLES = setOf("OPERATOR", "SUPER_OPERATOR")

/**
 * Shift-picker option (K9.1), unified across two sources: the new top-level `shifts` cache
 * (every active shift, clock only — present even with nobody allocated today) and, as a
 * fallback for an older server that doesn't send that key, the roster rollup's [ShiftSummary]
 * (which only ever lists shifts with at least one cached employee, and carries an
 * `employeeCount` this type deliberately omits since the primary source has no such count).
 */
data class PunchShiftOption(
    val id: String,
    val name: String?,
    val startTime: String?,
    val endTime: String?,
)

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
    private val rosterPreferences = RosterPreferences(application)
    private val rosterRepository = RosterRepository(
        context = application,
        api = api,
        database = database,
        rosterPreferences = rosterPreferences,
        credentialStore = credentialStore,
    )
    private val punchQueueDao = PunchQueueDatabase.getInstance(application).punchQueueDao()

    private val punchRepository = PunchRepository(
        context = application,
        api = api,
        punchStateDao = database.punchStateDao(),
        punchQueueDao = punchQueueDao,
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

    /** The signed-in kiosk operator (K9) — required before the punch screen is usable.
     *  In-memory only, cleared on end-of-shift (K11) or app restart; deliberately not persisted,
     *  since a new operator must sign in fresh each time the kiosk is (re)started. */
    private val _currentOperator = MutableStateFlow<EmployeeEntity?>(null)
    val currentOperator: StateFlow<EmployeeEntity?> = _currentOperator.asStateFlow()

    private val _operatorInput = MutableStateFlow("")
    val operatorInput: StateFlow<String> = _operatorInput.asStateFlow()

    private val _operatorMatch = MutableStateFlow<EmployeeEntity?>(null)
    val operatorMatch: StateFlow<EmployeeEntity?> = _operatorMatch.asStateFlow()

    /** Set when a matched badge is rejected for not holding an attendance-operator role
     *  (K9 gate). Mirrors [scanHint]'s role as this screen's text-feedback slot. */
    private val _operatorError = MutableStateFlow<String?>(null)
    val operatorError: StateFlow<String?> = _operatorError.asStateFlow()

    private var operatorLookupJob: Job? = null

    /** Shift the signed-in operator picked for this session (K9.1 gate) — every punch they
     *  process sends this shift's id, not the scanned employee's own roster shift, since the
     *  operator may be running a gate for a shift other than their own. Cleared alongside
     *  [currentOperator] on end-of-shift so the next operator must pick again too. */
    private val _selectedShift = MutableStateFlow<PunchShiftOption?>(null)
    val selectedShift: StateFlow<PunchShiftOption?> = _selectedShift.asStateFlow()

    /** Cached shifts available to pick from — prefers the new top-level active-shifts cache
     *  (every active shift, clock only, even with nobody allocated today) and falls back to
     *  the roster rollup (same query as the read-only Shifts info screen,
     *  [com.example.mis_kiosk.ui.shifts.ShiftsViewModel]) only when that cache is empty, i.e.
     *  an older server that doesn't send the new `shifts` key at all. */
    private val shiftOptions: Flow<List<PunchShiftOption>> = combine(
        rosterRepository.activeShifts,
        employeeDao.observeShiftSummaries(),
    ) { activeShifts, rollup ->
        if (activeShifts.isNotEmpty()) {
            activeShifts.map { PunchShiftOption(it.id, it.name, it.startTime, it.endTime) }
        } else {
            rollup.map { PunchShiftOption(it.shiftId, it.shiftName, it.shiftStartTime, it.shiftEndTime) }
        }
    }

    val shifts: StateFlow<List<PunchShiftOption>> =
        shiftOptions.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        // After a re-sync the picked shift may no longer exist; clear it so the operator must
        // re-pick rather than punches carrying a dead shiftId. Collects the raw DB-backed flow
        // (not the stateIn above) so its initial emptyList() can never clear a valid pick.
        viewModelScope.launch {
            shiftOptions.collect { options ->
                val selected = _selectedShift.value
                if (selected != null && options.none { it.id == selected.id }) {
                    _selectedShift.value = null
                }
            }
        }
    }

    fun selectShift(shift: PunchShiftOption) {
        _selectedShift.value = shift
    }

    fun onOperatorInputChange(value: String) {
        _operatorInput.value = value.take(40)
        _operatorError.value = null
        operatorLookupJob?.cancel()
        val code = _operatorInput.value
        if (code.isEmpty()) {
            _operatorMatch.value = null
            return
        }
        operatorLookupJob = viewModelScope.launch {
            val match = employeeDao.findByBadgeCode(code) ?: employeeDao.findByBadgeCode(code.uppercase())
            _operatorMatch.value = match
        }
    }

    /**
     * Gates sign-in on `operatorRole` (OPERATOR/SUPER_OPERATOR) once the server sends it. If
     * the whole cached roster has nobody with a non-null `operatorRole`, this is an older
     * server that doesn't send the key at all yet — fall back to today's behaviour (accept any
     * matched badge) rather than locking every kiosk out.
     */
    fun confirmOperatorSignIn() {
        val operator = _operatorMatch.value ?: return
        viewModelScope.launch {
            val accepted = when {
                operator.operatorRole in OPERATOR_ROLES -> true
                // Legacy fallback only for a server that predates the shifts/operator contract
                // (last /pull had no `shifts` key). Otherwise strict, even with zero operators.
                rosterPreferences.serverPredatesShiftContract && employeeDao.countWithOperatorRole() == 0 -> {
                    android.util.Log.w(
                        "PunchViewModel",
                        "No cached employee has operatorRole set; treating server as pre-rollout and accepting any matched badge",
                    )
                    true
                }
                else -> false
            }
            if (accepted) {
                _currentOperator.value = operator
                _operatorInput.value = ""
                _operatorMatch.value = null
                _operatorError.value = null
            } else {
                _operatorError.value = "Not an attendance operator"
            }
        }
    }

    /** End of shift (K11) — clears the signed-in operator, sending the screen back to the
     *  sign-in gate so the next operator identifies themselves before punching anyone. */
    fun endShift() {
        _currentOperator.value = null
        _selectedShift.value = null
    }

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

    /** Routes through the same photo confirm card the QR path already shows (PunchMode.Confirming
     *  is entry-path-agnostic — [confirmScannedPunch] submits whatever employee/kind is in it
     *  regardless of how the screen got there) rather than submitting straight away, so manual
     *  entry gets the same buddy-punching check QR scanning always had. */
    fun confirmManualEntry() {
        val employee = _manualMatch.value ?: return
        viewModelScope.launch {
            val kind = punchRepository.nextKindFor(employee.id)
            _mode.value = PunchMode.Confirming(employee, kind)
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
            // The OPERATOR-selected shift for this session, not the employee's own roster
            // shift — the gate may be running for a shift other than the employee's own.
            shiftId = _selectedShift.value?.id,
            kind = kind,
            key = UUID.randomUUID().toString(),
            clientRecordedAtIso = Instant.now().toString(),
            operatorId = _currentOperator.value?.id,
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
                operatorId = attempt.operatorId,
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
                operatorId = attempt.operatorId,
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
                watchForExternalResolution(attempt.key)
                PunchSubmission.RetryPrompt(attempt.employeeName, result.detail ?: "Could not reach the server.")
            }
        }
    }

    private var staleWatchJob: Job? = null

    /** A RetryPrompt left on screen can be resolved by someone else entirely — WorkManager's
     *  background flush runs its own [PunchRepository] instance and has no way to tell this
     *  screen it already applied the same key. Without this, the operator can sit looking at
     *  "Can't reach the server" for a punch that's already gone through. */
    private fun watchForExternalResolution(key: String) {
        staleWatchJob?.cancel()
        staleWatchJob = viewModelScope.launch {
            punchQueueDao.observeAllOrdered().collect { entries ->
                val entry = entries.find { it.key == key }
                val resolvedElsewhere = entry == null || entry.status != com.example.mis_kiosk.data.local.PunchQueueStatus.PENDING
                if (resolvedElsewhere && pending?.key == key && _submission.value is PunchSubmission.RetryPrompt) {
                    pending = null
                    _submission.value = null
                }
            }
        }
    }
}

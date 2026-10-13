package com.example.mis_kiosk.data.repository

import android.content.Context
import com.example.mis_kiosk.data.health.collectHealthReport
import com.example.mis_kiosk.data.local.PunchQueueDao
import com.example.mis_kiosk.data.local.PunchQueueEntity
import com.example.mis_kiosk.data.local.PunchQueueStatus
import com.example.mis_kiosk.data.local.PunchStateDao
import com.example.mis_kiosk.data.local.PunchStateEntity
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.local.RosterPreferences
import com.example.mis_kiosk.data.network.ApiResult
import com.example.mis_kiosk.data.network.KioskApi
import com.example.mis_kiosk.data.network.dto.HealthReportDto
import com.example.mis_kiosk.data.network.dto.PunchPayloadDto
import com.example.mis_kiosk.data.network.dto.PunchRequest
import com.example.mis_kiosk.data.network.dto.PunchResultDto
import com.example.mis_kiosk.data.security.ActiveDevice
import com.example.mis_kiosk.data.security.DeviceCredentialStore
import com.example.mis_kiosk.data.time.ShiftWindow
import com.example.mis_kiosk.data.time.WorkDate
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.flow.Flow

sealed interface PunchAttemptResult {
    data class Applied(val result: PunchResultDto, val wasDuplicate: Boolean) : PunchAttemptResult
    /** Stays queued (status PARKED) — never auto-retried; only a person resolves it. */
    data class Parked(val reason: String?, val detail: String?) : PunchAttemptResult
    /** Stays queued (status REJECTED) for visibility — that key is permanently poisoned. */
    data class Rejected(val reason: String?, val detail: String?) : PunchAttemptResult
    /** Stays queued (status PENDING) — 503 RETRY, a network hiccup, or an unexpected error;
     *  all three mean "still worth resending this exact same attempt later." */
    data class RetryNeeded(val detail: String?) : PunchAttemptResult
    /** R3 B66 — this one row can never be sent as-is (HTTP 400/404/413, or 10 failed flushes):
     *  parked as STUCK so the rows behind it flow. The Health screen offers a "Retry". */
    data class Stuck(val detail: String?) : PunchAttemptResult
    /** R3 B66 — HTTP 401: this tablet's token is no longer accepted. Nothing is marked or counted;
     *  the "must be paired again" banner is raised and the flush stops. */
    data object NeedsRepair : PunchAttemptResult
    /** The server said `wipe: true` — this tablet is revoked and has already been wiped. The
     *  queue row stays on disk but nothing flushes it without credentials. */
    data object Revoked : PunchAttemptResult
}

/** Why a [PunchRepository.flushQueue] pass ended. */
enum class FlushStop {
    /** Every PENDING row was handled (applied, parked, rejected or stuck). */
    DRAINED,
    /** A transient failure; the rest of the queue should wait for the next trigger. */
    RETRY_NEEDED,
    /** HTTP 401 — nothing will go through until the tablet is paired again. */
    NEEDS_REPAIR,
    /** The server said `wipe: true`. */
    REVOKED,
}

/** R3 B66 — a row whose 5xx/network failures reach this many is parked as STUCK. */
const val MAX_FLUSH_ATTEMPTS = 10

private const val PUNCH_LOG_TAG = "PunchRepository"

/** android.util.Log throws in plain JVM unit tests; logging must never be able to fail a punch. */
private fun logI(message: String) {
    try {
        android.util.Log.i(PUNCH_LOG_TAG, message)
    } catch (_: Throwable) {
        // not running on Android (unit test)
    }
}

/**
 * Process-wide guard against the same key being sent twice at once. `WorkManager`'s background
 * flush and the punch screen's own 8s on-screen retry-prompt replay each run against their own
 * [PunchRepository] instance with no shared state — nothing stopped both from retrying the same
 * still-PENDING key within the same few seconds, confirmed live (two concurrent POSTs for one
 * key, both landing as Applied, saved only by the server's own idempotency dedup). A key-level
 * lock here is the one place both paths actually go through.
 */
private object InFlightPunchKeys {
    private val keys = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
    fun tryAcquire(key: String): Boolean = keys.add(key)
    fun isHeld(key: String): Boolean = keys.contains(key)
    fun release(key: String) {
        keys.remove(key)
    }
}

/**
 * The Android-free core: every platform dependency is a function parameter so the queue logic is
 * unit-testable on the JVM. Production code uses the secondary constructor, which wires them to
 * the real [Context], credential store, preferences and roster database.
 */
class PunchRepository(
    private val api: KioskApi,
    private val punchStateDao: PunchStateDao,
    private val punchQueueDao: PunchQueueDao,
    private val deviceProvider: () -> ActiveDevice?,
    private val healthProvider: suspend (queuedPunches: Int) -> HealthReportDto? = { null },
    private val zoneProvider: () -> ZoneId = { ZoneId.systemDefault() },
    private val shiftsProvider: suspend () -> List<ShiftWindow> = { emptyList() },
    private val onNeedsRepair: () -> Unit = {},
    private val onAccepted: () -> Unit = {},
    private val onRevoked: suspend () -> Unit = {},
) {
    constructor(
        context: Context,
        api: KioskApi,
        punchStateDao: PunchStateDao,
        punchQueueDao: PunchQueueDao,
        credentialStore: DeviceCredentialStore,
    ) : this(
        api = api,
        punchStateDao = punchStateDao,
        punchQueueDao = punchQueueDao,
        deviceProvider = { credentialStore.activeDevice },
        healthProvider = { collectHealthReport(context, it) },
        zoneProvider = { RosterPreferences(context).factoryZone },
        shiftsProvider = {
            RosterDatabase.getInstance(context).activeShiftDao().all().map { ShiftWindow(it.id, it.startTime, it.endTime) }
        },
        onNeedsRepair = { RosterPreferences(context).needsRepair = true },
        onAccepted = {
            val prefs = RosterPreferences(context)
            if (prefs.needsRepair) prefs.needsRepair = false
        },
        onRevoked = { wipeAll(context) },
    )

    val pendingCount: Flow<Int> = punchQueueDao.observePendingCount()
    val needsAttention: Flow<List<PunchQueueEntity>> = punchQueueDao.observeNeedsAttention()

    /** The app's own toggle memory (HANDOVER.md §4.4) — server exposes no current status.
     *  Accounts for a punch still sitting unresolved in the queue, not only a confirmed one,
     *  so scanning the same badge twice before the first attempt lands doesn't queue two
     *  punch_ins in a row. [shiftId] is the operator's selected shift (the same hint the punch
     *  itself will carry), so the work-date check matches what the server will decide. */
    suspend fun nextKindFor(employeeId: String, shiftId: String? = null): NextKind {
        val pendingKind = punchQueueDao.mostRecentPendingKind(employeeId)
        val state = if (pendingKind == null) punchStateDao.find(employeeId) else null
        return decideNextKind(
            pendingKind = pendingKind,
            lastDirection = state?.lastDirection,
            lastPunchedAtMillis = state?.lastPunchedAtMillis,
            nowMillis = System.currentTimeMillis(),
            zone = zoneProvider(),
            lastWorkDate = state?.lastWorkDate,
            shifts = shiftsProvider(),
            shiftId = shiftId,
        )
    }

    /**
     * Writes the attempt to disk BEFORE ever touching the network, then makes one immediate
     * try — so a punch survives the app being killed mid-request, not only a network drop
     * discovered after the fact. If the immediate try comes back [PunchAttemptResult.RetryNeeded],
     * the entry is left PENDING for [flushQueue] to pick up later.
     */
    suspend fun enqueueAndAttempt(
        employeeId: String,
        employeeName: String,
        badgeCode: String,
        shiftId: String?,
        kind: String,
        key: String,
        clientRecordedAtIso: String,
        operatorId: String? = null,
    ): PunchAttemptResult {
        punchQueueDao.insert(
            PunchQueueEntity(
                key = key,
                employeeId = employeeId,
                employeeName = employeeName,
                badgeCode = badgeCode,
                shiftId = shiftId,
                kind = kind,
                clientRecordedAt = clientRecordedAtIso,
                queuedAtMillis = System.currentTimeMillis(),
                status = PunchQueueStatus.PENDING,
                operatorId = operatorId,
            ),
        )
        return attempt(key, employeeId, badgeCode, shiftId, kind, clientRecordedAtIso, operatorId, allowWipe = true)
    }

    /** Clears a PARKED/REJECTED/STUCK entry the operator has acknowledged — never called for a
     *  still-PENDING one, which only ever leaves the queue by actually resolving. */
    suspend fun dismiss(key: String) = punchQueueDao.delete(key)

    /** R3 B66 — the Health screen's "Retry" on a STUCK row: attempts reset, back to PENDING. */
    suspend fun retryStuck(key: String) = punchQueueDao.retryStuck(key)

    /** Re-tries one still-PENDING attempt exactly as originally captured (same key, kind,
     *  and clientRecordedAt) — used by the screen's manual "Retry" button. */
    suspend fun retry(
        employeeId: String,
        badgeCode: String,
        shiftId: String?,
        kind: String,
        key: String,
        clientRecordedAtIso: String,
        operatorId: String? = null,
    ): PunchAttemptResult = attempt(key, employeeId, badgeCode, shiftId, kind, clientRecordedAtIso, operatorId, allowWipe = true)

    /**
     * Drains every PENDING entry, oldest tap first, strictly one at a time — HANDOVER.md's
     * offline-queue item: "flush the queue on reconnect, oldest first, one at a time. Never
     * batch-merge queued punches into one call." A PARKED, REJECTED or STUCK entry does *not*
     * stop the drain — it's marked and the flush moves on (R3 B66: one bad row must never block
     * the rows behind it). A RETRY/network hiccup DOES stop it, since a transient outage almost
     * always affects every remaining entry too; so does a 401 (nothing will be accepted until the
     * tablet is paired again). The next trigger resumes from the top.
     *
     * [allowWipe] is false only for the drain that runs *inside* the revoked-tablet wipe (R3 B65),
     * which must not start a second wipe.
     */
    suspend fun flushQueue(allowWipe: Boolean = true): FlushStop {
        val pending = punchQueueDao.pendingOrdered()
        logI("FLUSH start, ${pending.size} pending")
        var stop = FlushStop.DRAINED
        for (entry in pending) {
            // Inside the wipe the punch that triggered it is still "in flight" up the stack; skip
            // it rather than let it end the drain before the rows behind it are sent.
            if (!allowWipe && InFlightPunchKeys.isHeld(entry.key)) continue
            val result = attempt(
                entry.key, entry.employeeId, entry.badgeCode, entry.shiftId, entry.kind,
                entry.clientRecordedAt, entry.operatorId, allowWipe,
            )
            stop = when (result) {
                is PunchAttemptResult.RetryNeeded -> FlushStop.RETRY_NEEDED
                PunchAttemptResult.NeedsRepair -> FlushStop.NEEDS_REPAIR
                PunchAttemptResult.Revoked -> FlushStop.REVOKED
                else -> FlushStop.DRAINED
            }
            if (stop != FlushStop.DRAINED) {
                logI("FLUSH stopped early ($stop): ${entry.key.takeLast(8)}")
                break
            }
        }
        logI("FLUSH done")
        return stop
    }

    private suspend fun attempt(
        key: String,
        employeeId: String,
        badgeCode: String,
        shiftId: String?,
        kind: String,
        clientRecordedAtIso: String,
        operatorId: String?,
        allowWipe: Boolean,
    ): PunchAttemptResult {
        if (!InFlightPunchKeys.tryAcquire(key)) {
            logI("SKIP key=…${key.takeLast(8)} already in flight elsewhere")
            return PunchAttemptResult.RetryNeeded("Already retrying — try again shortly.")
        }
        try {
            return attemptLocked(key, employeeId, badgeCode, shiftId, kind, clientRecordedAtIso, operatorId, allowWipe)
        } finally {
            InFlightPunchKeys.release(key)
        }
    }

    private suspend fun attemptLocked(
        key: String,
        employeeId: String,
        badgeCode: String,
        shiftId: String?,
        kind: String,
        clientRecordedAtIso: String,
        operatorId: String?,
        allowWipe: Boolean,
    ): PunchAttemptResult {
        val device = deviceProvider()
            ?: return PunchAttemptResult.RetryNeeded("This tablet is not paired.")
        val health = healthProvider(punchQueueDao.pendingCount())
        val body = PunchRequest(
            key = key,
            kind = kind,
            payload = PunchPayloadDto(badgeCode = badgeCode, shiftId = shiftId, operatorId = operatorId),
            clientRecordedAt = clientRecordedAtIso,
            health = health,
        )
        val startMillis = System.currentTimeMillis()
        val shortKey = key.takeLast(8)
        logI("SEND key=…$shortKey employee=$employeeId kind=$kind")
        val result = attemptResult(api.punch(device.token, body), key, employeeId, shiftId, clientRecordedAtIso, allowWipe)
        logI("DONE key=…$shortKey employee=$employeeId kind=$kind result=${result::class.simpleName} in ${System.currentTimeMillis() - startMillis}ms")
        return result
    }

    /** R3 B66 — a transient failure (5xx, network, RETRY, garbled body): count it, and at the cap
     *  park the row as STUCK instead of retrying it forever. */
    private suspend fun transientFailure(key: String, message: String): PunchAttemptResult {
        val attempts = (punchQueueDao.attemptsOf(key) ?: 0) + 1
        return if (attempts >= MAX_FLUSH_ATTEMPTS) {
            punchQueueDao.markStuck(key, attempts, message)
            PunchAttemptResult.Stuck(message)
        } else {
            punchQueueDao.recordFailure(key, attempts, message)
            PunchAttemptResult.RetryNeeded(message)
        }
    }

    private suspend fun attemptResult(
        response: ApiResult<com.example.mis_kiosk.data.network.dto.PunchResponse>,
        key: String,
        employeeId: String,
        shiftId: String?,
        clientRecordedAtIso: String,
        allowWipe: Boolean,
    ): PunchAttemptResult {
        return when (response) {
            is ApiResult.Success -> {
                onAccepted()
                when (val outcome = response.body.outcome) {
                    "APPLIED", "DUPLICATE" -> {
                        val punchResult = response.body.result
                        if (punchResult == null) {
                            transientFailure(key, "The server sent back something unexpected.")
                        } else {
                            recordPunchState(employeeId, punchResult, shiftId, clientRecordedAtIso)
                            punchQueueDao.delete(key)
                            PunchAttemptResult.Applied(punchResult, wasDuplicate = outcome == "DUPLICATE")
                        }
                    }
                    "PARKED" -> {
                        punchQueueDao.updateStatus(key, PunchQueueStatus.PARKED, response.body.detail)
                        PunchAttemptResult.Parked(response.body.reason, response.body.detail)
                    }
                    "REJECTED" -> {
                        punchQueueDao.updateStatus(key, PunchQueueStatus.REJECTED, response.body.detail)
                        PunchAttemptResult.Rejected(response.body.reason, response.body.detail)
                    }
                    "RETRY" -> transientFailure(key, response.body.detail ?: "The server asked to retry.")
                    else -> transientFailure(key, "The server sent back an unrecognised outcome.")
                }
            }
            is ApiResult.HttpError -> when {
                response.error?.wipe == true -> {
                    // Same revoked-tablet handling as the roster sync path (HANDOVER.md §6). The
                    // drain inside the wipe passes allowWipe = false so it can't recurse.
                    if (allowWipe) onRevoked()
                    PunchAttemptResult.Revoked
                }
                // The token is no longer accepted. Not the punch's fault: no attempt counted, no
                // row marked, but the whole flush stops and the re-pair banner goes up.
                response.code == 401 -> {
                    onNeedsRepair()
                    PunchAttemptResult.NeedsRepair
                }
                // This exact request can never succeed (malformed / unknown / too large): park it
                // so it cannot block the punches behind it (R3 B66, B71).
                response.code == 400 || response.code == 404 || response.code == 413 -> {
                    val message = if (response.code == 413) {
                        "Punch too large"
                    } else {
                        response.error?.message ?: "Rejected by the server (HTTP ${response.code})."
                    }
                    punchQueueDao.markStuck(key, punchQueueDao.attemptsOf(key) ?: 0, message)
                    PunchAttemptResult.Stuck(message)
                }
                else -> transientFailure(key, response.error?.message ?: "Could not submit the punch (HTTP ${response.code}).")
            }
            // A gate tablet loses wifi routinely (HANDOVER.md §3.6) — treat the same as a
            // server-side RETRY: back off and resend this exact same attempt.
            ApiResult.NetworkError ->
                transientFailure(key, "Can't reach the server. Check the tablet's network connection.")
            ApiResult.MalformedResponse ->
                transientFailure(key, "The server sent back something unexpected.")
        }
    }

    /**
     * R3 B67/B68: remember WHEN the punch happened (the tap moment, not the flush time - a punch
     * recorded at 23:00 and flushed at 07:00 is a 23:00 punch) and which factory work date it
     * belongs to (the server's answer, else the local port of its rule).
     */
    private suspend fun recordPunchState(employeeId: String, result: PunchResultDto, shiftId: String?, clientRecordedAtIso: String) {
        val instant = runCatching { Instant.parse(clientRecordedAtIso) }.getOrNull()
        val workDate = result.workDate
            ?: instant?.let { WorkDate.workDateFor(it, shiftsProvider(), zoneProvider(), shiftId).workDate }
        punchStateDao.record(
            PunchStateEntity(
                employeeId = employeeId,
                lastDirection = result.direction,
                lastPunchedAtMillis = instant?.toEpochMilli() ?: System.currentTimeMillis(),
                lastWorkDate = workDate,
            ),
        )
    }
}

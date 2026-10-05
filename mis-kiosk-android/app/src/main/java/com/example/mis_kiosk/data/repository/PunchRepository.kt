package com.example.mis_kiosk.data.repository

import android.content.Context
import com.example.mis_kiosk.data.health.collectHealthReport
import com.example.mis_kiosk.data.local.PunchQueueDao
import com.example.mis_kiosk.data.local.PunchQueueEntity
import com.example.mis_kiosk.data.local.PunchQueueStatus
import com.example.mis_kiosk.data.local.PunchStateDao
import com.example.mis_kiosk.data.local.PunchStateEntity
import com.example.mis_kiosk.data.network.ApiResult
import com.example.mis_kiosk.data.network.KioskApi
import com.example.mis_kiosk.data.network.dto.PunchKind
import com.example.mis_kiosk.data.network.dto.PunchPayloadDto
import com.example.mis_kiosk.data.network.dto.PunchRequest
import com.example.mis_kiosk.data.network.dto.PunchResultDto
import com.example.mis_kiosk.data.security.DeviceCredentialStore
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
}

private const val PUNCH_LOG_TAG = "PunchRepository"

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
    fun release(key: String) {
        keys.remove(key)
    }
}

class PunchRepository(
    private val context: Context,
    private val api: KioskApi,
    private val punchStateDao: PunchStateDao,
    private val punchQueueDao: PunchQueueDao,
    private val credentialStore: DeviceCredentialStore,
) {
    val pendingCount: Flow<Int> = punchQueueDao.observePendingCount()
    val needsAttention: Flow<List<PunchQueueEntity>> = punchQueueDao.observeNeedsAttention()

    /** The app's own toggle memory (HANDOVER.md §4.4) — server exposes no current status.
     *  Accounts for a punch still sitting unresolved in the queue, not only a confirmed one,
     *  so scanning the same badge twice before the first attempt lands doesn't queue two
     *  punch_ins in a row. */
    suspend fun nextKindFor(employeeId: String): String {
        val pendingKind = punchQueueDao.mostRecentPendingKind(employeeId)
        val lastDirection = when (pendingKind) {
            PunchKind.IN -> "IN"
            PunchKind.OUT -> "OUT"
            else -> punchStateDao.lastDirection(employeeId)
        }
        return if (lastDirection == "IN") PunchKind.OUT else PunchKind.IN
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
            ),
        )
        return attempt(key, employeeId, badgeCode, shiftId, kind, clientRecordedAtIso, operatorId)
    }

    /** Clears a PARKED/REJECTED entry the operator has acknowledged — never called for a
     *  still-PENDING one, which only ever leaves the queue by actually resolving. */
    suspend fun dismiss(key: String) = punchQueueDao.delete(key)

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
    ): PunchAttemptResult = attempt(key, employeeId, badgeCode, shiftId, kind, clientRecordedAtIso, operatorId)

    /**
     * Drains every PENDING entry, oldest tap first, strictly one at a time — HANDOVER.md's
     * offline-queue item: "flush the queue on reconnect, oldest first, one at a time. Never
     * batch-merge queued punches into one call." A PARKED or REJECTED entry does *not* stop
     * the drain — it's marked and the flush moves on. A RETRY/network hiccup DOES stop it,
     * since a transient outage almost always affects every remaining entry too; the next
     * trigger (regained connectivity, app foreground, periodic nudge) resumes from the top.
     */
    suspend fun flushQueue() {
        val pending = punchQueueDao.pendingOrdered()
        android.util.Log.i(PUNCH_LOG_TAG, "FLUSH start, ${pending.size} pending")
        for (entry in pending) {
            val result = attempt(entry.key, entry.employeeId, entry.badgeCode, entry.shiftId, entry.kind, entry.clientRecordedAt)
            if (result is PunchAttemptResult.RetryNeeded) {
                android.util.Log.i(PUNCH_LOG_TAG, "FLUSH stopped early: ${entry.key.takeLast(8)} still needs retry")
                break
            }
        }
        android.util.Log.i(PUNCH_LOG_TAG, "FLUSH done")
    }

    private suspend fun attempt(
        key: String,
        employeeId: String,
        badgeCode: String,
        shiftId: String?,
        kind: String,
        clientRecordedAtIso: String,
        operatorId: String? = null,
    ): PunchAttemptResult {
        if (!InFlightPunchKeys.tryAcquire(key)) {
            android.util.Log.i(PUNCH_LOG_TAG, "SKIP key=…${key.takeLast(8)} already in flight elsewhere")
            return PunchAttemptResult.RetryNeeded("Already retrying — try again shortly.")
        }
        try {
            return attemptLocked(key, employeeId, badgeCode, shiftId, kind, clientRecordedAtIso, operatorId)
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
    ): PunchAttemptResult {
        val device = credentialStore.activeDevice
            ?: return PunchAttemptResult.RetryNeeded("This tablet is not paired.")
        val health = collectHealthReport(context, queuedPunches = punchQueueDao.pendingCount())
        val body = PunchRequest(
            key = key,
            kind = kind,
            payload = PunchPayloadDto(badgeCode = badgeCode, shiftId = shiftId, operatorId = operatorId),
            clientRecordedAt = clientRecordedAtIso,
            health = health,
        )
        val startMillis = System.currentTimeMillis()
        val shortKey = key.takeLast(8)
        android.util.Log.i(PUNCH_LOG_TAG, "SEND key=…$shortKey employee=$employeeId kind=$kind")
        val result = attemptResult(api.punch(device.token, body), key, employeeId)
        android.util.Log.i(
            PUNCH_LOG_TAG,
            "DONE key=…$shortKey employee=$employeeId kind=$kind result=${result::class.simpleName} in ${System.currentTimeMillis() - startMillis}ms",
        )
        return result
    }

    private suspend fun attemptResult(
        response: ApiResult<com.example.mis_kiosk.data.network.dto.PunchResponse>,
        key: String,
        employeeId: String,
    ): PunchAttemptResult {
        return when (response) {
            is ApiResult.Success -> when (val outcome = response.body.outcome) {
                "APPLIED", "DUPLICATE" -> {
                    val punchResult = response.body.result
                    if (punchResult == null) {
                        PunchAttemptResult.RetryNeeded("The server sent back something unexpected.")
                    } else {
                        punchStateDao.record(PunchStateEntity(employeeId, punchResult.direction, System.currentTimeMillis()))
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
                "RETRY" -> PunchAttemptResult.RetryNeeded(response.body.detail)
                else -> PunchAttemptResult.RetryNeeded("The server sent back an unrecognised outcome.")
            }
            is ApiResult.HttpError ->
                PunchAttemptResult.RetryNeeded(response.error?.message ?: "Could not submit the punch (HTTP ${response.code}).")
            // A gate tablet loses wifi routinely (HANDOVER.md §3.6) — treat the same as a
            // server-side RETRY: back off and resend this exact same attempt.
            ApiResult.NetworkError ->
                PunchAttemptResult.RetryNeeded("Can't reach the server. Check the tablet's network connection.")
            ApiResult.MalformedResponse ->
                PunchAttemptResult.RetryNeeded("The server sent back something unexpected.")
        }
    }
}

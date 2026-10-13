package com.example.mis_kiosk.data.repository

import android.content.Context
import androidx.room.withTransaction
import androidx.work.WorkManager
import com.example.mis_kiosk.data.local.PunchQueueDatabase
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.local.RosterPreferences
import com.example.mis_kiosk.data.network.ApiClient
import com.example.mis_kiosk.data.security.DeviceCredentialStore
import com.example.mis_kiosk.data.work.PunchFlushScheduler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** R3 B65 — the longest the wipe waits for the queue to drain before it wipes anyway. */
const val WIPE_DRAIN_TIMEOUT_MS = 20_000L

/**
 * R3 B65: give the queue ONE chance to empty, then wipe. The drain is bounded by [timeoutMs] and
 * can never stop the wipe: a timeout, a network error or any other failure just means the rows
 * stay in the queue (as before). Only the caller's own cancellation is rethrown - and even then
 * the wipe still runs (it is the whole point of a revoked tablet), uncancellably.
 */
suspend fun drainThenWipe(
    drain: suspend () -> Unit,
    wipe: suspend () -> Unit,
    timeoutMs: Long = WIPE_DRAIN_TIMEOUT_MS,
) {
    try {
        withTimeoutOrNull(timeoutMs) { drain() }
    } catch (e: CancellationException) {
        withContext(NonCancellable) { wipe() }
        throw e
    } catch (_: Exception) {
        // A failed drain leaves the rows queued; the wipe below still runs.
    }
    withContext(NonCancellable) { wipe() }
}

/**
 * The single wipe path for a revoked tablet (HANDOVER.md §6): credentials, roster, active shifts,
 * per-employee punch state and roster preferences all go. The operator/shift session lives in
 * the punch ViewModel and is cleared there when it sees the revoked signal.
 *
 * The offline punch queue rows are deliberately KEPT (a retired tablet's queued punches may still
 * land), but with the credentials gone nothing is allowed to flush them, so the flush worker is
 * cancelled here and [PunchFlushScheduler.schedule] refuses to enqueue while unpaired. R3 B65:
 * BEFORE the credentials go, one bounded flush (the server accepts revoked-device punches) tries
 * to send whatever is still PENDING; rows that still don't go stay queued.
 */
suspend fun wipeAll(
    context: Context,
    credentialStore: DeviceCredentialStore,
    database: RosterDatabase,
    rosterPreferences: RosterPreferences,
    drain: suspend () -> Unit = {
        PunchRepository(
            context = context,
            api = ApiClient.kioskApi,
            punchStateDao = database.punchStateDao(),
            punchQueueDao = PunchQueueDatabase.getInstance(context).punchQueueDao(),
            credentialStore = credentialStore,
        ).flushQueue(allowWipe = false)
    },
) = drainThenWipe(drain = drain, wipe = {
    credentialStore.wipe()
    database.withTransaction {
        database.employeeDao().deleteAll()
        database.activeShiftDao().deleteAll()
        database.punchStateDao().deleteAll()
    }
    rosterPreferences.clear()
    WorkManager.getInstance(context.applicationContext).cancelUniqueWork(PunchFlushScheduler.UNIQUE_WORK_NAME)
})

/** Convenience for callers that only have a [Context] (the punch path). */
suspend fun wipeAll(context: Context) = wipeAll(
    context = context,
    credentialStore = DeviceCredentialStore(context),
    database = RosterDatabase.getInstance(context),
    rosterPreferences = RosterPreferences(context),
)

package com.example.mis_kiosk.data.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.mis_kiosk.data.local.PunchQueueDatabase
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.network.ApiClient
import com.example.mis_kiosk.data.repository.FlushStop
import com.example.mis_kiosk.data.repository.PunchRepository
import com.example.mis_kiosk.data.security.DeviceCredentialStore

/** R3 B69: WorkManager retries (with backoff) only for a transient stop with rows still waiting. */
internal fun shouldRetryFlush(stop: FlushStop, stillPending: Boolean): Boolean =
    stop == FlushStop.RETRY_NEEDED && stillPending

/**
 * Drains the offline punch queue, oldest tap first, one at a time. Constrained to
 * `NetworkType.CONNECTED` by [PunchFlushScheduler] — WorkManager itself is what survives the
 * app being killed, so a queued punch still gets flushed even if nothing ever reopens the app
 * before connectivity returns.
 */
class PunchFlushWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val credentialStore = DeviceCredentialStore(applicationContext)
        if (credentialStore.activeDevice == null) return Result.success()
        val repository = PunchRepository(
            context = applicationContext,
            api = ApiClient.kioskApi,
            punchStateDao = RosterDatabase.getInstance(applicationContext).punchStateDao(),
            punchQueueDao = PunchQueueDatabase.getInstance(applicationContext).punchQueueDao(),
            credentialStore = credentialStore,
        )
        val stop = repository.flushQueue()
        // R3 B69: a transient failure with rows still waiting must be retried by WorkManager (with
        // the scheduler's exponential backoff), not forgotten until the next app open. A 401 is not
        // transient (the banner asks for a re-pair) and a revoked tablet has nothing left to send.
        val stillPending = PunchQueueDatabase.getInstance(applicationContext).punchQueueDao().pendingCount() > 0
        return if (shouldRetryFlush(stop, stillPending)) Result.retry() else Result.success()
    }
}

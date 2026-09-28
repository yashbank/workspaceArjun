package com.example.mis_kiosk.data.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.mis_kiosk.data.local.PunchQueueDatabase
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.network.ApiClient
import com.example.mis_kiosk.data.repository.PunchRepository
import com.example.mis_kiosk.data.security.DeviceCredentialStore

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
        repository.flushQueue()
        return Result.success()
    }
}

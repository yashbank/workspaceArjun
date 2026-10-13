package com.example.mis_kiosk.data.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.example.mis_kiosk.data.security.DeviceCredentialStore
import java.util.concurrent.TimeUnit

object PunchFlushScheduler {
    const val UNIQUE_WORK_NAME = "punch-flush"

    /** R3 B69: first retry after 30 s, doubling (WorkManager caps it at 5 h). */
    const val BACKOFF_START_SECONDS = 30L

    /**
     * Safe to call often — on app start, when a punch is queued, and whenever connectivity
     * comes back — since `ExistingWorkPolicy.KEEP` makes every call after the first a no-op
     * while a flush is already pending or running.
     */
    fun schedule(context: Context) {
        // A wiped (revoked/unpaired) tablet has no credentials to flush with; queued rows stay on
        // disk but nothing should keep waking the worker.
        if (DeviceCredentialStore(context.applicationContext).activeDevice == null) return
        val request = OneTimeWorkRequestBuilder<PunchFlushWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_START_SECONDS, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }
}

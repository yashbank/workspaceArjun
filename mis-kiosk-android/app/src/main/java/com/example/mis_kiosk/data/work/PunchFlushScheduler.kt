package com.example.mis_kiosk.data.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

object PunchFlushScheduler {
    private const val UNIQUE_WORK_NAME = "punch-flush"

    /**
     * Safe to call often — on app start, when a punch is queued, and whenever connectivity
     * comes back — since `ExistingWorkPolicy.KEEP` makes every call after the first a no-op
     * while a flush is already pending or running.
     */
    fun schedule(context: Context) {
        val request = OneTimeWorkRequestBuilder<PunchFlushWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }
}

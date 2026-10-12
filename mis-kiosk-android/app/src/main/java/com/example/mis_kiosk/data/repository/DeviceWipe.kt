package com.example.mis_kiosk.data.repository

import android.content.Context
import androidx.room.withTransaction
import androidx.work.WorkManager
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.local.RosterPreferences
import com.example.mis_kiosk.data.security.DeviceCredentialStore
import com.example.mis_kiosk.data.work.PunchFlushScheduler

/**
 * The single wipe path for a revoked tablet (HANDOVER.md §6): credentials, roster, active shifts,
 * per-employee punch state and roster preferences all go. The operator/shift session lives in
 * the punch ViewModel and is cleared there when it sees the revoked signal.
 *
 * The offline punch queue rows are deliberately KEPT (a retired tablet's queued punches may still
 * land), but with the credentials gone nothing is allowed to flush them, so the flush worker is
 * cancelled here and [PunchFlushScheduler.schedule] refuses to enqueue while unpaired.
 */
suspend fun wipeAll(
    context: Context,
    credentialStore: DeviceCredentialStore,
    database: RosterDatabase,
    rosterPreferences: RosterPreferences,
) {
    credentialStore.wipe()
    database.withTransaction {
        database.employeeDao().deleteAll()
        database.activeShiftDao().deleteAll()
        database.punchStateDao().deleteAll()
    }
    rosterPreferences.clear()
    WorkManager.getInstance(context.applicationContext).cancelUniqueWork(PunchFlushScheduler.UNIQUE_WORK_NAME)
}

/** Convenience for callers that only have a [Context] (the punch path). */
suspend fun wipeAll(context: Context) = wipeAll(
    context = context,
    credentialStore = DeviceCredentialStore(context),
    database = RosterDatabase.getInstance(context),
    rosterPreferences = RosterPreferences(context),
)

package com.example.mis_kiosk.data.local

import android.content.Context

/** Just a sync timestamp — nothing here is sensitive, so plain (not encrypted) prefs are fine. */
class RosterPreferences(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("roster_prefs", Context.MODE_PRIVATE)

    var lastSyncedAtMillis: Long?
        get() = prefs.getLong(KEY_LAST_SYNCED_AT, -1L).takeIf { it >= 0 }
        set(value) = prefs.edit().putLong(KEY_LAST_SYNCED_AT, value ?: -1L).apply()

    /** True only when the last successful /pull had no `shifts` key at all (a server that
     *  predates the operator/shift contract). Gates the "accept any badge" sign-in fallback. */
    var serverPredatesShiftContract: Boolean
        get() = prefs.getBoolean(KEY_LEGACY_SERVER, false)
        set(value) = prefs.edit().putBoolean(KEY_LEGACY_SERVER, value).apply()

    private companion object {
        const val KEY_LEGACY_SERVER = "server_predates_shift_contract"
        const val KEY_LAST_SYNCED_AT = "last_synced_at_millis"
    }
}

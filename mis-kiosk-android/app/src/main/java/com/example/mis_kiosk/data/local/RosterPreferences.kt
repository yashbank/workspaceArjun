package com.example.mis_kiosk.data.local

import android.content.Context
import com.example.mis_kiosk.data.time.FactoryDay
import java.time.ZoneId

/** Sync timestamp, factory zone and the re-pair flag — nothing here is sensitive, so plain (not encrypted) prefs are fine. */
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

    /** R3 B68: the factory's IANA zone from the last pull; null until a new server sends it. */
    var factoryTimezone: String?
        get() = prefs.getString(KEY_FACTORY_TZ, null)
        set(value) = prefs.edit().apply { if (value == null) remove(KEY_FACTORY_TZ) else putString(KEY_FACTORY_TZ, value) }.apply()

    /** The zone every factory-day decision uses: the factory's, else this device's. */
    val factoryZone: ZoneId get() = FactoryDay.zoneFrom(factoryTimezone)

    /** R3 B66: the server answered 401 - this tablet's token is no longer valid, so it must be
     *  paired again. Shown as a banner; cleared by the next accepted call or by the wipe. */
    var needsRepair: Boolean
        get() = prefs.getBoolean(KEY_NEEDS_REPAIR, false)
        set(value) = prefs.edit().putBoolean(KEY_NEEDS_REPAIR, value).apply()

    /** Part of the revoked-tablet wipe: forget the sync time and legacy-server flag. */
    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_LEGACY_SERVER = "server_predates_shift_contract"
        const val KEY_LAST_SYNCED_AT = "last_synced_at_millis"
        const val KEY_FACTORY_TZ = "factory_timezone"
        const val KEY_NEEDS_REPAIR = "needs_repair"
    }
}

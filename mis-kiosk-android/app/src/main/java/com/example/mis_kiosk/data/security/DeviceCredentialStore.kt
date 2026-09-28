package com.example.mis_kiosk.data.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** An in-flight pairing attempt: a code shown on screen, waiting on Admin approval. */
data class PendingEnrolment(
    val deviceId: String,
    val pollSecret: String,
    val code: String,
    val expiresAtMillis: Long,
)

/** A tablet that has collected its token and is paired. */
data class ActiveDevice(
    val deviceId: String,
    val token: String,
    val name: String,
)

/**
 * The device token is the tablet's only credential (HANDOVER.md §6) and must never be
 * logged or shown — so it, and the in-flight pairing secret that precedes it, live only
 * in Android Keystore-backed encrypted prefs, never in plain SharedPreferences or memory
 * that survives to a crash report.
 */
class DeviceCredentialStore(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    val activeDevice: ActiveDevice?
        get() {
            val deviceId = prefs.getString(KEY_ACTIVE_DEVICE_ID, null) ?: return null
            val token = prefs.getString(KEY_ACTIVE_TOKEN, null) ?: return null
            val name = prefs.getString(KEY_ACTIVE_NAME, null) ?: return null
            return ActiveDevice(deviceId, token, name)
        }

    val pendingEnrolment: PendingEnrolment?
        get() {
            val deviceId = prefs.getString(KEY_PENDING_DEVICE_ID, null) ?: return null
            val pollSecret = prefs.getString(KEY_PENDING_POLL_SECRET, null) ?: return null
            val code = prefs.getString(KEY_PENDING_CODE, null) ?: return null
            val expiresAt = prefs.getLong(KEY_PENDING_EXPIRES_AT, -1L)
            if (expiresAt < 0) return null
            return PendingEnrolment(deviceId, pollSecret, code, expiresAt)
        }

    fun savePendingEnrolment(pending: PendingEnrolment) {
        prefs.edit()
            .putString(KEY_PENDING_DEVICE_ID, pending.deviceId)
            .putString(KEY_PENDING_POLL_SECRET, pending.pollSecret)
            .putString(KEY_PENDING_CODE, pending.code)
            .putLong(KEY_PENDING_EXPIRES_AT, pending.expiresAtMillis)
            .apply()
    }

    fun clearPendingEnrolment() {
        prefs.edit()
            .remove(KEY_PENDING_DEVICE_ID)
            .remove(KEY_PENDING_POLL_SECRET)
            .remove(KEY_PENDING_CODE)
            .remove(KEY_PENDING_EXPIRES_AT)
            .apply()
    }

    /** The one moment the server ever hands back the token (HANDOVER.md §4.2) — store it now. */
    fun saveActiveDevice(device: ActiveDevice) {
        prefs.edit()
            .putString(KEY_ACTIVE_DEVICE_ID, device.deviceId)
            .putString(KEY_ACTIVE_TOKEN, device.token)
            .putString(KEY_ACTIVE_NAME, device.name)
            .apply()
    }

    /** A revoked tablet wipes its token and cached roster the moment it sees `wipe: true` (§6). */
    fun wipe() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val PREFS_FILE_NAME = "kiosk_device_credentials"
        const val KEY_PENDING_DEVICE_ID = "pending_device_id"
        const val KEY_PENDING_POLL_SECRET = "pending_poll_secret"
        const val KEY_PENDING_CODE = "pending_code"
        const val KEY_PENDING_EXPIRES_AT = "pending_expires_at"
        const val KEY_ACTIVE_DEVICE_ID = "active_device_id"
        const val KEY_ACTIVE_TOKEN = "active_token"
        const val KEY_ACTIVE_NAME = "active_name"
    }
}

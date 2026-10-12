package com.example.mis_kiosk.data.repository

import android.content.Context
import androidx.room.withTransaction
import com.example.mis_kiosk.data.health.collectHealthReport
import com.example.mis_kiosk.data.local.ActiveShiftEntity
import com.example.mis_kiosk.data.local.EmployeeEntity
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.local.RosterPreferences
import com.example.mis_kiosk.data.network.ApiResult
import com.example.mis_kiosk.data.network.KioskApi
import com.example.mis_kiosk.data.network.decodesAsImage
import com.example.mis_kiosk.data.network.dto.ApiErrorDto
import com.example.mis_kiosk.data.network.dto.EmployeeDto
import com.example.mis_kiosk.data.network.dto.ShiftListEntryDto
import com.example.mis_kiosk.data.security.DeviceCredentialStore
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow

sealed interface RosterSyncResult {
    data class Success(val count: Int) : RosterSyncResult
    data class Failure(val message: String) : RosterSyncResult
    /** Server said `{"error":"REVOKED","wipe":true}` — token + cache are already wiped. */
    data object Revoked : RosterSyncResult
    data object NotPaired : RosterSyncResult
}

class RosterRepository(
    private val context: Context,
    private val api: KioskApi,
    private val database: RosterDatabase,
    private val rosterPreferences: RosterPreferences,
    private val credentialStore: DeviceCredentialStore,
) {
    private val employeeDao = database.employeeDao()
    private val activeShiftDao = database.activeShiftDao()

    val employees: Flow<List<EmployeeEntity>> = employeeDao.observeAll()
    val activeShifts: Flow<List<ActiveShiftEntity>> = activeShiftDao.observeAll()
    val lastSyncedAtMillis: Long? get() = rosterPreferences.lastSyncedAtMillis

    suspend fun sync(queuedPunches: Int = 0): RosterSyncResult {
        val device = credentialStore.activeDevice ?: return RosterSyncResult.NotPaired
        val health = collectHealthReport(context, queuedPunches)

        return when (val result = api.pull(device.token, health)) {
            is ApiResult.Success -> {
                // An empty roster would lock everyone out; keep the old cache instead.
                if (result.body.employees.isEmpty()) {
                    return RosterSyncResult.Failure("The server returned an empty roster; keeping the existing cached roster.")
                }
                // MIS V2: faces are cached with the roster so the confirm card works offline. The
                // URL carries a version, so an unchanged photo is reused from the cache and only new
                // or retaken ones are fetched — in parallel. A fetch that fails leaves that face absent
                // (the card falls back to the initial); it never fails the roster sync.
                val cached = employeeDao.photosByUrl().associate { it.photoUrl to it.photo }
                val entities = coroutineScope {
                    result.body.employees.map { dto ->
                        async {
                            val url = dto.photoUrl
                            val photo = when {
                                url == null -> null
                                cached[url]?.let { decodesAsImage(it) } == true -> cached[url] // poisoned (non-image) bytes are refetched
                                else -> api.fetchPhoto(device.token, url)
                            }
                            dto.toEntity(photo = photo)
                        }
                    }.awaitAll()
                }
                // Only replace the active-shifts cache when the server actually sent the key.
                // An older server omits it entirely (field absent, not an empty array) — leave
                // whatever's cached from a previous sync untouched rather than clearing it.
                val activeShifts = result.body.shifts
                database.withTransaction {
                    employeeDao.deleteAll()
                    employeeDao.insertAll(entities)
                    if (activeShifts != null) {
                        activeShiftDao.deleteAll()
                        activeShiftDao.insertAll(activeShifts.map { it.toEntity() })
                    }
                }
                rosterPreferences.serverPredatesShiftContract = activeShifts == null
                rosterPreferences.lastSyncedAtMillis = System.currentTimeMillis()
                RosterSyncResult.Success(entities.size)
            }
            is ApiResult.HttpError -> {
                // A revoked tablet must wipe its token and cached roster the moment it
                // sees this, on any call (HANDOVER.md §6) — not just on /pull.
                if (result.error?.wipe == true) {
                    wipeAll(context, credentialStore, database, rosterPreferences)
                    RosterSyncResult.Revoked
                } else {
                    RosterSyncResult.Failure(httpErrorMessage(result.code, result.error))
                }
            }
            ApiResult.NetworkError ->
                RosterSyncResult.Failure("Can't reach the server. Check the tablet's network connection.")
            ApiResult.MalformedResponse ->
                RosterSyncResult.Failure("The server sent back something unexpected.")
        }
    }

    private fun httpErrorMessage(httpStatus: Int, error: ApiErrorDto?): String =
        error?.message ?: "Could not sync the roster (HTTP $httpStatus)."
}

private fun ShiftListEntryDto.toEntity() = ActiveShiftEntity(
    id = id,
    name = name,
    startTime = startTime,
    endTime = endTime,
)

private fun EmployeeDto.toEntity(photo: ByteArray?) = EmployeeEntity(
    id = id,
    name = name,
    badgeCode = badgeCode,
    shiftId = shift?.id,
    shiftName = shift?.name,
    shiftStartTime = shift?.startTime,
    shiftEndTime = shift?.endTime,
    photo = photo,
    photoUrl = photoUrl,
    operatorRole = operatorRole,
)

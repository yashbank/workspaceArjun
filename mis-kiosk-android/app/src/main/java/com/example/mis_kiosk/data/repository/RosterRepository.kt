package com.example.mis_kiosk.data.repository

import android.content.Context
import androidx.room.withTransaction
import com.example.mis_kiosk.data.health.collectHealthReport
import com.example.mis_kiosk.data.local.EmployeeEntity
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.local.RosterPreferences
import com.example.mis_kiosk.data.network.ApiResult
import com.example.mis_kiosk.data.network.KioskApi
import com.example.mis_kiosk.data.network.dto.ApiErrorDto
import com.example.mis_kiosk.data.network.dto.EmployeeDto
import com.example.mis_kiosk.data.security.DeviceCredentialStore
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

    val employees: Flow<List<EmployeeEntity>> = employeeDao.observeAll()
    val lastSyncedAtMillis: Long? get() = rosterPreferences.lastSyncedAtMillis

    suspend fun sync(queuedPunches: Int = 0): RosterSyncResult {
        val device = credentialStore.activeDevice ?: return RosterSyncResult.NotPaired
        val health = collectHealthReport(context, queuedPunches)

        return when (val result = api.pull(device.token, health)) {
            is ApiResult.Success -> {
                // MIS V2: faces are cached with the roster so the confirm card works offline.
                // A photo that cannot be fetched is simply absent — the card falls back to the initial.
                val entities = result.body.employees.map { dto ->
                    dto.toEntity(photo = dto.photoUrl?.let { api.fetchPhoto(device.token, it) })
                }
                database.withTransaction {
                    employeeDao.deleteAll()
                    employeeDao.insertAll(entities)
                }
                rosterPreferences.lastSyncedAtMillis = System.currentTimeMillis()
                RosterSyncResult.Success(entities.size)
            }
            is ApiResult.HttpError -> {
                // A revoked tablet must wipe its token and cached roster the moment it
                // sees this, on any call (HANDOVER.md §6) — not just on /pull.
                if (result.error?.wipe == true) {
                    credentialStore.wipe()
                    database.withTransaction { employeeDao.deleteAll() }
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

private fun EmployeeDto.toEntity(photo: ByteArray?) = EmployeeEntity(
    id = id,
    name = name,
    badgeCode = badgeCode,
    shiftId = shift?.id,
    shiftName = shift?.name,
    shiftStartTime = shift?.startTime,
    shiftEndTime = shift?.endTime,
    photo = photo,
)

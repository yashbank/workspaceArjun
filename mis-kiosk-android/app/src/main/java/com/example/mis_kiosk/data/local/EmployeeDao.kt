package com.example.mis_kiosk.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface EmployeeDao {
    /** Every column EXCEPT `photo`: this Flow re-emits on each roster write, and dragging every
     *  face (up to ~200 KB each) through it on a low-RAM tablet is what #54 was about. */
    @Query(
        "SELECT id, name, badgeCode, shiftId, shiftName, shiftStartTime, shiftEndTime, photoUrl, operatorRole " +
            "FROM employees ORDER BY name ASC",
    )
    fun observeAll(): Flow<List<EmployeeLite>>

    /** Badge lookup without the photo; the face is fetched with [photoById] only for the confirm card. */
    @Query(
        "SELECT id, name, badgeCode, shiftId, shiftName, shiftStartTime, shiftEndTime, photoUrl, operatorRole " +
            "FROM employees WHERE badgeCode = :badgeCode LIMIT 1",
    )
    suspend fun findByBadgeCode(badgeCode: String): EmployeeLite?

    @Query("SELECT photo FROM employees WHERE id = :id")
    suspend fun photoById(id: String): ByteArray?

    @Query("SELECT COUNT(*) FROM employees")
    suspend fun count(): Int

    /** Cheap check for whether this server sends `operatorRole` at all — zero here means an
     *  older server (the key is simply absent), so operator sign-in should fall back to
     *  accepting any matched badge rather than rejecting everyone. */
    @Query("SELECT COUNT(*) FROM employees WHERE operatorRole IN ('OPERATOR', 'SUPER_OPERATOR')")
    suspend fun countWithOperatorRole(): Int

    @Query("DELETE FROM employees")
    suspend fun deleteAll()

    @Insert
    suspend fun insertAll(employees: List<EmployeeEntity>)

    /** MIS V2 — the cached faces keyed by their versioned URL, so a roster sync re-downloads only what changed. */
    @Query("SELECT photoUrl, photo FROM employees WHERE photoUrl IS NOT NULL AND photo IS NOT NULL")
    suspend fun photosByUrl(): List<CachedPhoto>

    /** Read-only roster-cache rollup for the kiosk's "View shifts" info screen — distinct
     *  shifts currently present locally, with how many cached employees sit on each. */
    @Query(
        "SELECT shiftId, shiftName, shiftStartTime, shiftEndTime, COUNT(*) AS employeeCount " +
            "FROM employees WHERE shiftId IS NOT NULL " +
            "GROUP BY shiftId ORDER BY shiftStartTime ASC",
    )
    fun observeShiftSummaries(): Flow<List<ShiftSummary>>
}

data class ShiftSummary(
    val shiftId: String,
    val shiftName: String?,
    val shiftStartTime: String?,
    val shiftEndTime: String?,
    val employeeCount: Int,
)

/** [EmployeeEntity] minus the photo bytes (see [EmployeeDao.observeAll]). */
data class EmployeeLite(
    val id: String,
    val name: String,
    val badgeCode: String,
    val shiftId: String?,
    val shiftName: String?,
    val shiftStartTime: String?,
    val shiftEndTime: String?,
    val photoUrl: String?,
    val operatorRole: String?,
) {
    /** A photo-less [EmployeeEntity]; load the face separately with [EmployeeDao.photoById]. */
    fun toEntity() = EmployeeEntity(
        id = id,
        name = name,
        badgeCode = badgeCode,
        shiftId = shiftId,
        shiftName = shiftName,
        shiftStartTime = shiftStartTime,
        shiftEndTime = shiftEndTime,
        photo = null,
        photoUrl = photoUrl,
        operatorRole = operatorRole,
    )
}

/** One cached face: the versioned URL it came from and its bytes. */
data class CachedPhoto(
    val photoUrl: String,
    val photo: ByteArray,
)

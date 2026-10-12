package com.example.mis_kiosk.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface PunchStateDao {
    @Query("SELECT lastDirection FROM punch_state WHERE employeeId = :employeeId")
    suspend fun lastDirection(employeeId: String): String?

    /** Local-only, best-effort — this device's own view, not a factory-wide count. */
    @Query("SELECT COUNT(*) FROM punch_state WHERE lastDirection = 'IN' AND lastPunchedAtMillis >= :factoryDayStart")
    fun observeClockedInCount(factoryDayStart: Long): Flow<Int>

    /** Part of the revoked-tablet wipe. */
    @Query("DELETE FROM punch_state")
    suspend fun deleteAll()

    /** When and which way this employee last punched here, for missed-clock-out detection. */
    @Query("SELECT * FROM punch_state WHERE employeeId = :employeeId")
    suspend fun find(employeeId: String): PunchStateEntity?

    @Upsert
    suspend fun record(state: PunchStateEntity)
}

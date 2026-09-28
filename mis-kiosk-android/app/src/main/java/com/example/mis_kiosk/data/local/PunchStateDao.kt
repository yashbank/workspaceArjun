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
    @Query("SELECT COUNT(*) FROM punch_state WHERE lastDirection = 'IN'")
    fun observeClockedInCount(): Flow<Int>

    @Upsert
    suspend fun record(state: PunchStateEntity)
}

package com.example.mis_kiosk.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert

@Dao
interface PunchStateDao {
    @Query("SELECT lastDirection FROM punch_state WHERE employeeId = :employeeId")
    suspend fun lastDirection(employeeId: String): String?

    @Upsert
    suspend fun record(state: PunchStateEntity)
}

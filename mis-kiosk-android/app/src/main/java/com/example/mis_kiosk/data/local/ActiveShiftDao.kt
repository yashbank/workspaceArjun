package com.example.mis_kiosk.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ActiveShiftDao {
    @Query("SELECT * FROM active_shifts ORDER BY startTime ASC")
    fun observeAll(): Flow<List<ActiveShiftEntity>>

    @Query("DELETE FROM active_shifts")
    suspend fun deleteAll()

    @Insert
    suspend fun insertAll(shifts: List<ActiveShiftEntity>)
}

package com.example.mis_kiosk.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface EmployeeDao {
    @Query("SELECT * FROM employees ORDER BY name ASC")
    fun observeAll(): Flow<List<EmployeeEntity>>

    @Query("SELECT * FROM employees WHERE badgeCode = :badgeCode LIMIT 1")
    suspend fun findByBadgeCode(badgeCode: String): EmployeeEntity?

    @Query("SELECT COUNT(*) FROM employees")
    suspend fun count(): Int

    @Query("DELETE FROM employees")
    suspend fun deleteAll()

    @Insert
    suspend fun insertAll(employees: List<EmployeeEntity>)

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

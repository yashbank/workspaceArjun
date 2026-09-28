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
}

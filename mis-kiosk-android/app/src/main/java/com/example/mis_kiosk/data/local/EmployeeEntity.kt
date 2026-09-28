package com.example.mis_kiosk.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * The offline cache of the roster pull (HANDOVER.md §4.3) — flattened rather than a
 * separate shift table, since a shift only ever arrives nested under one employee here
 * and nothing else in this app queries shifts on their own.
 */
@Entity(tableName = "employees", indices = [Index(value = ["badgeCode"])])
data class EmployeeEntity(
    @PrimaryKey val id: String,
    val name: String,
    val badgeCode: String,
    val shiftId: String?,
    val shiftName: String?,
    val shiftStartTime: String?,
    val shiftEndTime: String?,
)

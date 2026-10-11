package com.example.mis_kiosk.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * The offline cache of the top-level `shifts` array from /pull (HANDOVER.md §4.3) — every
 * active shift, clock only, regardless of whether anyone is allocated to it today. Separate
 * from [EmployeeEntity]'s flattened shift columns (that rollup only ever shows shifts with at
 * least one cached employee on them); this table is what lets the shift-picker show a shift
 * with zero allocations.
 */
@Entity(tableName = "active_shifts")
data class ActiveShiftEntity(
    @PrimaryKey val id: String,
    val name: String,
    val startTime: String,
    val endTime: String,
)

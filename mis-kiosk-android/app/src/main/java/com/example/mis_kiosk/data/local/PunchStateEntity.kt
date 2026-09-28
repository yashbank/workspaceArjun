package com.example.mis_kiosk.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * The pull payload (HANDOVER.md §4.3) doesn't expose an employee's current in/out status —
 * "the app decides which [direction]... the server does not infer it" (§4.4). This is the
 * app's own memory of which way each employee last punched, purely to drive the toggle shown
 * on screen; it is never sent to the server as truth, only used to pick the next `kind`.
 */
@Entity(tableName = "punch_state")
data class PunchStateEntity(
    @PrimaryKey val employeeId: String,
    val lastDirection: String,
    val lastPunchedAtMillis: Long,
)

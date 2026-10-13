package com.example.mis_kiosk.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/** The three states a queued punch can rest in — HANDOVER.md's offline-queue item. */
object PunchQueueStatus {
    /** Not yet applied — still worth a flush attempt. */
    const val PENDING = "PENDING"
    /** Server said PARKED — needs a person's judgement; never auto-retried. */
    const val PARKED = "PARKED"
    /** Server said REJECTED — that key is permanently poisoned; kept only for visibility. */
    const val REJECTED = "REJECTED"
    /** R3 B66 - this one row cannot be sent (HTTP 400/404/413, or 10 failed flushes). It never
     *  blocks the rows behind it; the Health screen lists it with a "Retry" button. */
    const val STUCK = "STUCK"
}

/**
 * A punch attempt that hasn't been confirmed `APPLIED`/`DUPLICATE` yet. Written to disk BEFORE
 * the first network attempt (not only on failure) so a punch survives the app being killed
 * mid-request, not just a network drop after the fact. `key`/`kind`/`clientRecordedAt` are
 * fixed at insert time and never regenerated on retry (D15) — [PunchQueueDao] only ever
 * updates `status`/`detail`, never those fields.
 */
@Entity(tableName = "punch_queue")
data class PunchQueueEntity(
    @PrimaryKey val key: String,
    val employeeId: String,
    val employeeName: String,
    val badgeCode: String,
    val shiftId: String?,
    val kind: String,
    val clientRecordedAt: String,
    val queuedAtMillis: Long,
    val status: String,
    val detail: String? = null,
    /** Operator who captured this punch (null = none/legacy row). Fixed at insert; sent on every flush/retry. */
    val operatorId: String? = null,
    /** R3 B66 - failed flushes so far (5xx / network). 401 never counts. */
    @ColumnInfo(defaultValue = "0") val attempts: Int = 0,
    /** R3 B66 - why the last attempt failed, shown next to a STUCK row. */
    val lastError: String? = null,
)

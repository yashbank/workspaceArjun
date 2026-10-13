package com.example.mis_kiosk.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface PunchQueueDao {
    @Insert
    suspend fun insert(entry: PunchQueueEntity)

    /** FIFO by the tap moment, not insertion time — HANDOVER.md's flush ordering. */
    @Query("SELECT * FROM punch_queue WHERE status = 'PENDING' ORDER BY clientRecordedAt ASC, queuedAtMillis ASC")
    suspend fun pendingOrdered(): List<PunchQueueEntity>

    @Query("SELECT * FROM punch_queue WHERE status != 'PENDING' ORDER BY queuedAtMillis DESC")
    fun observeNeedsAttention(): Flow<List<PunchQueueEntity>>

    /** K2 — offline sync queue screen: every entry regardless of status, newest first. */
    @Query("SELECT * FROM punch_queue ORDER BY queuedAtMillis DESC")
    fun observeAllOrdered(): Flow<List<PunchQueueEntity>>

    @Query("SELECT COUNT(*) FROM punch_queue WHERE status = 'PENDING'")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM punch_queue WHERE status = 'PENDING'")
    suspend fun pendingCount(): Int

    /** The most recent not-yet-resolved attempt for this employee, if any — lets the toggle
     *  account for a punch still sitting in the queue, not only ones already `APPLIED`. */
    @Query("SELECT kind FROM punch_queue WHERE employeeId = :employeeId AND status = 'PENDING' ORDER BY clientRecordedAt DESC LIMIT 1")
    suspend fun mostRecentPendingKind(employeeId: String): String?

    @Query("UPDATE punch_queue SET status = :status, detail = :detail WHERE key = :key")
    suspend fun updateStatus(key: String, status: String, detail: String?)

    @Query("SELECT attempts FROM punch_queue WHERE key = :key")
    suspend fun attemptsOf(key: String): Int?

    /** R3 B66 - a 5xx / network failure: counts toward the 10-attempt cap, row stays PENDING. */
    @Query("UPDATE punch_queue SET attempts = :attempts, lastError = :error WHERE key = :key")
    suspend fun recordFailure(key: String, attempts: Int, error: String?)

    /** R3 B66 - this row can never be sent as-is; park it so the rows behind it can flow. */
    @Query("UPDATE punch_queue SET status = 'STUCK', attempts = :attempts, lastError = :error, detail = :error WHERE key = :key")
    suspend fun markStuck(key: String, attempts: Int, error: String?)

    @Query("SELECT * FROM punch_queue WHERE status = 'STUCK' ORDER BY clientRecordedAt ASC")
    suspend fun stuckOrdered(): List<PunchQueueEntity>

    /** R3 B66 - the Health screen's "Retry": back to PENDING with a clean slate. */
    @Query("UPDATE punch_queue SET status = 'PENDING', attempts = 0, lastError = NULL, detail = NULL WHERE key = :key AND status = 'STUCK'")
    suspend fun retryStuck(key: String)

    @Query("DELETE FROM punch_queue WHERE key = :key")
    suspend fun delete(key: String)
}

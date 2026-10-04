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

    @Query("DELETE FROM punch_queue WHERE key = :key")
    suspend fun delete(key: String)
}

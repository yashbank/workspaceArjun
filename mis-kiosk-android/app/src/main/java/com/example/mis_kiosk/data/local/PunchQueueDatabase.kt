package com.example.mis_kiosk.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Kept separate from [RosterDatabase] on purpose: that one is a disposable cache re-fetched
 * from `/pull` and can safely fall back to a destructive migration. This one holds real,
 * unsent punches — a schema change here must use a proper Room `Migration`, never
 * `fallbackToDestructiveMigration`, or a device with punches still queued would silently
 * lose them on its next app update.
 */
@Database(entities = [PunchQueueEntity::class], version = 1, exportSchema = false)
abstract class PunchQueueDatabase : RoomDatabase() {
    abstract fun punchQueueDao(): PunchQueueDao

    companion object {
        @Volatile private var instance: PunchQueueDatabase? = null

        fun getInstance(context: Context): PunchQueueDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, PunchQueueDatabase::class.java, "punch_queue.db")
                    .build()
                    .also { instance = it }
            }
    }
}

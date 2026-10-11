package com.example.mis_kiosk.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Kept separate from [RosterDatabase] on purpose: that one is a disposable cache re-fetched
 * from `/pull` and can safely fall back to a destructive migration. This one holds real,
 * unsent punches — a schema change here must use a proper Room `Migration`, never
 * `fallbackToDestructiveMigration`, or a device with punches still queued would silently
 * lose them on its next app update.
 */
@Database(entities = [PunchQueueEntity::class], version = 2, exportSchema = false)
abstract class PunchQueueDatabase : RoomDatabase() {
    abstract fun punchQueueDao(): PunchQueueDao

    companion object {
        /** v1 -> v2: queued punches remember which operator captured them. Additive and
         *  nullable: existing unsent rows are kept untouched (operatorId stays NULL). */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE punch_queue ADD COLUMN operatorId TEXT")
            }
        }

        @Volatile private var instance: PunchQueueDatabase? = null

        fun getInstance(context: Context): PunchQueueDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, PunchQueueDatabase::class.java, "punch_queue.db")
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { instance = it }
            }
    }
}
